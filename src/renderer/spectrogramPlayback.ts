import * as Tone from 'tone'

import { PlaybackManager } from './playback'
import { SpectrogramLocator } from './locator'

import Nexus from './nexusColored'

import { getMidiInputListener } from './midiIn'
import { IMidiChannel } from 'webmidi'

interface NoteEvent {
  note: string
  midi: number
  velocity: number
}

export class SpectrogramPlaybackManager extends PlaybackManager<SpectrogramLocator> {
  // initialize crossfade to play player A
  protected masterLimiter: Tone.Limiter = new Tone.Limiter(-10).toDestination()
  protected masterGain: Tone.Gain = new Tone.Gain(1).connect(this.masterLimiter)
  protected crossFade: Tone.CrossFade = new Tone.CrossFade(0).connect(
    this.masterGain
  )
  protected player_A: Tone.Player = new Tone.Player().connect(this.crossFade.a)
  protected player_B: Tone.Player = new Tone.Player().connect(this.crossFade.b)

  protected buffer_A: Tone.ToneAudioBuffer = new Tone.ToneAudioBuffer()
  protected buffer_B: Tone.ToneAudioBuffer = new Tone.ToneAudioBuffer()
  protected sampler_A: Tone.Sampler = new Tone.Sampler({
    C4: this.buffer_A,
  }).connect(this.crossFade.a)
  protected sampler_B: Tone.Sampler = new Tone.Sampler({
    C4: this.buffer_B,
  }).connect(this.crossFade.b)
  protected samplers: Tone.Sampler[] = [this.sampler_A, this.sampler_B]

  protected crossFadeDuration: Tone.Unit.Time = '1'
  // look-ahead duration to retrieve the state of the crossfade after potential fading operations
  protected crossFadeOffset: Tone.Unit.Time = '+1.1'

  constructor(locator: SpectrogramLocator) {
    super(locator)

    this.scheduleInitialPlaybackLoop()

    void getMidiInputListener().then((midiListener) => {
      if (midiListener !== null) {
        midiListener.on('keyDown', this.onkeydown.bind(this))
        midiListener.on('keyUp', this.onkeyup.bind(this))
      }
    })
  }

  protected onkeyup(data: NoteEvent): this {
    this.samplers.forEach((sampler) => sampler.triggerRelease(data.note))
    return this
  }

  // plays the sound on all samplers to ensure smooth transitioning
  // in the advent of inpainting operations
  protected onkeydown(data: NoteEvent): this {
    this.samplers.forEach((sampler) =>
      sampler.triggerAttack(data.note, undefined, data.velocity)
    )
    return this
  }

  // duration of the currently playing player in seconds
  public get duration_s(): number {
    return this.currentPlayer().buffer.duration
  }

  protected setPlaybackPositionDisplay(timePosition: number): void {
    this.locator.setPosition(timePosition)
  }

  protected getCurrentDisplayTimestep(): number {
    // TODO(theis): fix method name, this returns the ratio of progress in the playback
    return Tone.getTransport().progress
  }

  protected currentPlayerIsA(): boolean {
    return this.crossFade.fade.getValueAtTime(this.crossFadeOffset) <= 0.5
  }

  // return the buffer scheduled to play after any eventual crossfade operation has been completed
  protected currentBuffer(): Tone.ToneAudioBuffer {
    return this.currentPlayerIsA() ? this.buffer_A : this.buffer_B
  }

  // return the sampler scheduled to play after any eventual crossfade operation has been completed
  protected currentSampler(): Tone.Sampler {
    return this.currentPlayerIsA() ? this.sampler_A : this.sampler_B
  }

  // return the player scheduled to play after any eventual crossfade operation has been completed
  protected currentPlayer(): Tone.Player {
    return this.currentPlayerIsA() ? this.player_A : this.player_B
  }

  // return the player scheduled to be idle after any eventual crossfade operation has been completed
  protected nextPlayer(): Tone.Player {
    return this.currentPlayerIsA() ? this.player_B : this.player_A
  }

  // return the buffer scheduled to be idle after any eventual crossfade operation has been completed
  protected nextBuffer(): Tone.ToneAudioBuffer {
    return this.currentPlayerIsA() ? this.buffer_B : this.buffer_A
  }

  // crossfade between the two players
  protected switchPlayers() {
    const currentScheduledValue: number = this.crossFade.fade.getValueAtTime(
      this.crossFadeOffset
    )
    const newValue: number = Math.round(1 - currentScheduledValue) // round ensures binary values
    this.crossFade.fade.linearRampTo(newValue, this.crossFadeDuration)
  }

  // initialize the Transport loop and synchronize the two players
  protected scheduleInitialPlaybackLoop() {
    this.player_A.sync()
    this.player_B.sync()
    Tone.getTransport().loop = true
  }

  // load a remote audio file into the next player and switch playback to it
  async loadAudio(audioURL: string): Promise<void> {
    await Promise.all([
      this.nextPlayer().load(audioURL),
      this.nextBuffer().load(audioURL),
    ])

    // must unsync/resync to remove scheduled play/stop commands,
    // otherwise the following stop() command is rejected
    this.nextPlayer().unsync()
    // required playback stop to allow playing the newly loaded buffer
    this.nextPlayer().stop()
    this.nextPlayer().sync()

    // reschedule the Transport loop
    Tone.getTransport().setLoopPoints(0, this.nextPlayer().buffer.duration)
    this.nextPlayer().start(0)

    this.switchPlayers()
  }

  // TODO(theis): move methods from index.ts to this class
  loadSpectrogram(serverURL: string, command: string, codes: number[][]): void {
    throw new Error('Not implemented')
  }

  setFadeIn(duration_s: number) {
    this.player_A.fadeIn = this.player_B.fadeIn = this.sampler_A.attack = this.sampler_B.attack = duration_s
  }

  get Gain(): number {
    return this.masterGain.gain.value
  }
  set Gain(newGain: number) {
    this.masterGain.gain.value = newGain
  }
}

export function renderFadeInControl(
  element: HTMLElement,
  spectrogramPlaybackManager: SpectrogramPlaybackManager
): void {
  const fadeInControl = new Nexus.Toggle(element.id, {
    size: [40, 20],
    state: false,
  })
  const fadeIn_duration_s = 0.01
  fadeInControl.on('change', function (useFadeIn: boolean) {
    spectrogramPlaybackManager.setFadeIn(useFadeIn ? fadeIn_duration_s : 0)
  })
}

interface NoteEventWithChannel extends NoteEvent {
  channel?: IMidiChannel
}

export class MultiChannelSpectrogramPlaybackManager extends SpectrogramPlaybackManager {
  readonly numVoices: number = 16 // for MIDI playback
  protected voices_A: Tone.Sampler[]
  protected voices_B: Tone.Sampler[]

  constructor(locator: SpectrogramLocator) {
    super(locator)

    this.voices_A = Array(this.numVoices)
      .fill(0)
      .map(() => {
        return new Tone.Sampler({
          C4: new Tone.Buffer(this.buffer_A.get()),
        }).connect(this.crossFade.a)
      })
    this.voices_B = Array(this.numVoices)
      .fill(0)
      .map(() => {
        return new Tone.Sampler({
          C4: new Tone.Buffer(this.buffer_B.get()),
        }).connect(this.crossFade.b)
      })
  }

  protected onkeydown(data: NoteEventWithChannel) {
    this.getSamplersByMidiChannel(data.channel).forEach((voice) =>
      voice.triggerAttack(data.note, undefined, data.velocity)
    )
    return this
  }

  protected onkeyup(data: NoteEventWithChannel) {
    this.getSamplersByMidiChannel(data.channel).forEach((voice) => {
      voice.triggerRelease(data.note)
    })
    return this
  }

  get currentVoices(): Tone.Sampler[] {
    return this.currentPlayerIsA() ? this.voices_A : this.voices_B
  }

  protected getSamplersByMidiChannel(channel: IMidiChannel): Tone.Sampler[] {
    if (channel === 'all') {
      return this.currentVoices
    } else if (Array.isArray(channel)) {
      return this.currentVoices.filter((value, index) => {
        channel.contains(index + 1)
      })
    } else {
      return [this.currentVoices[channel - 1]]
    }
  }

  protected updateBuffers(): void {
    // this.currentVoices.forEach((voice) => voice.set({urls: {
    //     'C4': this.currentBuffer().get()}})
    // );
    this.voices_A.forEach((voice) => {
      voice.dispose()
    })
    this.voices_A.clear()
    this.voices_A = Array(this.numVoices)
      .fill(0)
      .map(() => {
        return new Tone.Sampler({
          C4: new Tone.Buffer(this.buffer_A.get()),
        }).connect(this.crossFade.a)
      })
    this.voices_B.forEach((voice) => {
      voice.dispose()
    })
    this.voices_B.clear()
    this.voices_B = Array(this.numVoices)
      .fill(0)
      .map(() => {
        return new Tone.Sampler({
          C4: new Tone.Buffer(this.buffer_B.get()),
        }).connect(this.crossFade.b)
      })
  }

  async loadAudio(audioURL: string): Promise<void> {
    await super.loadAudio(audioURL)
    this.voices_A.forEach((voice) => {
      voice.add('C4', this.buffer_A.get())
    })
    this.voices_B.forEach((voice) => {
      voice.add('C4', this.buffer_B.get())
    })
  }

  setFadeIn(duration_s: number) {
    super.setFadeIn(duration_s)
    this.voices_A.forEach((voice) => {
      voice.attack = duration_s
    })
    this.voices_B.forEach((voice) => {
      voice.attack = duration_s
    })
  }
}

export function renderGainControl(
  element: HTMLElement,
  spectrogramPlaybackManager: SpectrogramPlaybackManager
): void {
  const gainControl = new Nexus.Slider(element.id, {
    size: [60, 20],
    mode: 'absolute',
    min: 0,
    max: 1.2,
    step: 0,
    value: 1,
  })

  gainControl.on('change', function (newGain: number) {
    spectrogramPlaybackManager.Gain = newGain
  })
  gainControl.value = 1
}
