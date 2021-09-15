import { PlaybackManager } from './playback'

import * as Tone from 'tone'
import { Piano as PianoType } from '@tonejs/piano'
import * as log from 'loglevel'
import { Midi, Track } from '@tonejs/midi'
import { Note as MidiNote } from '@tonejs/midi/src/Note'
import WebMidi from 'webmidi'
import $ from 'jquery'

import * as Instruments from './instruments'
import * as MidiOut from './midiOut'
import * as Chord from './chord'
import { BPMControl } from './numberControl'
import { SheetLocator } from './locator'
import { ControlChange } from '@tonejs/midi/src/ControlChange'

export default class MidiSheetPlaybackManager extends PlaybackManager {
  readonly bpmControl: BPMControl

  constructor(bpmControl: BPMControl) {
    super()
    this.bpmControl = bpmControl
    this.transport.bpm.value = this.bpmControl.value
    this.registerTempoUpdateCallback()
    this.toggleLowLatency(false)
  }

  registerTempoUpdateCallback(): void {
    this.bpmControl.on('interface-tempo-changed', (newBpm: number) => {
      // HACK perform a comparison to avoid messaging loops, since
      // the link update triggers a bpm modification message
      this.transport.bpm.value = newBpm
    })
    this.bpmControl.on('interface-tempo-changed-silent', (newBpm: number) => {
      // HACK perform a comparison to avoid messaging loops, since
      // the link update triggers a bpm modification message
      this.transport.bpm.value = newBpm
    })
  }
  protected getPlayNoteByMidiChannel(
    midiChannel: number,
    useChordsInstruments = false
  ): (
    time: number,
    event: { name: string; velocity: number; duration: number }
  ) => void {
    let getCurrentInstrument = Instruments.getCurrentInstrument
    if (useChordsInstruments) {
      getCurrentInstrument = Instruments.getCurrentChordsInstrument
    }
    const getTimingOffset = () => {
      // https://github.com/Tonejs/Tone.js/issues/805#issuecomment-748172477
      return WebMidi.time - this.transport.context.currentTime * 1000
    }

    const timingOffset = getTimingOffset()
    function playNote(
      time: number,
      event: { name: string; velocity: number; duration: number }
    ) {
      const currentInstrument = getCurrentInstrument(midiChannel)
      if (currentInstrument != null) {
        if ('keyUp' in currentInstrument) {
          currentInstrument.keyDown({
            note: event.name,
            time: time,
            velocity: event.velocity,
          })
          currentInstrument.keyUp({
            note: event.name,
            time: time + event.duration,
          })
        } else if ('triggerAttackRelease' in currentInstrument) {
          currentInstrument.triggerAttackRelease(
            event.name,
            event.duration,
            time,
            event.velocity
          )
        }
        log.trace(`Play note event @ time ${time}: ` + JSON.stringify(event))
      }

      MidiOut.getOutput().then(
        (currentMidiOutput) => {
          if (currentMidiOutput) {
            currentMidiOutput.playNote(event.name, midiChannel, {
              time: time * 1000 + timingOffset,
              duration: event.duration * 1000,
            })
          }
        },
        (reason) => {
          log.error('Failed to retrieve current Midi Output with error: ')
          log.error(reason)
        }
      )
    }

    return playNote
  }

  triggerPedalCallback: (time: Tone.Unit.Time, event: ControlChange) => void = (
    time: Tone.Unit.Time,
    event: ControlChange
  ) => {
    const currentInstrument = Instruments.getCurrentInstrument()
    if ('pedalUp' in currentInstrument) {
      if (event.value) {
        currentInstrument.pedalDown({ time: time })
      } else {
        currentInstrument.pedalUp({ time: time })
      }
    }
  }

  protected quartersProgress(): number {
    const [currentBar, currentQuarter] = this.transport.position
      .toString()
      .split(':')
      .map((value) => Math.floor(parseFloat(value)))
      .slice(0, 2)

    // FIXME assumes a constant Time Signature of 4/4
    const currentStep: number = 4 * currentBar + currentQuarter // % sequenceDuration_quarters
    return currentStep
  }

  protected midiParts_A = new Map<number, Tone.Part<MidiNote>>()
  protected midiParts_B = new Map<number, Tone.Part<MidiNote>>()
  protected controlChanges_A = new Map<number, Tone.Part<ControlChange>>()
  protected controlChanges_B = new Map<number, Tone.Part<ControlChange>>()
  protected get midiParts(): Map<number, Tone.Part<MidiNote>>[] {
    return [this.midiParts_A, this.midiParts_B]
  }
  protected get controlChanges(): Map<number, Tone.Part<ControlChange>>[] {
    return [this.controlChanges_A, this.controlChanges_B]
  }

  protected aIsMuted(): boolean {
    return Array.from(this.midiParts_A.values()).every((part) => part.mute)
  }

  protected get playingMidiPartsIndex(): number {
    if (this.aIsMuted()) {
      return 1
    } else {
      return 0
    }
  }

  protected get nextMidiPartsIndex(): number {
    return 1 - this.playingMidiPartsIndex
  }

  protected getPlayingMidiParts(): Map<number, Tone.Part<MidiNote>> {
    return this.midiParts[this.playingMidiPartsIndex]
  }

  protected getNextMidiParts(): Map<number, Tone.Part<MidiNote>> {
    return this.midiParts[this.nextMidiPartsIndex]
  }

  protected getPlayingControlChanges(): Map<number, Tone.Part<ControlChange>> {
    return this.controlChanges[this.playingMidiPartsIndex]
  }

  protected getNextControlChanges(): Map<number, Tone.Part<ControlChange>> {
    return this.controlChanges[this.nextMidiPartsIndex]
  }

  protected switchTracks(): void {
    const playing = this.getPlayingMidiParts()
    const playingControlChanges = this.getPlayingControlChanges()
    const next = this.getNextMidiParts()
    const nextControlChanges = this.getNextControlChanges()

    if (playing != next) {
      playing.forEach((part) => {
        part.mute = true
      })
    }
    next.forEach((part) => {
      part.mute = false
    })
    if (playingControlChanges != nextControlChanges) {
      playingControlChanges.forEach((controlChanges) => {
        controlChanges.mute = true
      })
    }
    nextControlChanges.forEach((controlChanges) => {
      controlChanges.mute = false
    })
  }

  scheduleTrackToInstrument(
    sequenceDuration_toneTime: Tone.TimeClass,
    midiTrack: Track,
    midiChannel = 1
  ): void {
    const notes: MidiNote[] = midiTrack.notes
    const playNote_callback = this.getPlayNoteByMidiChannel(midiChannel)

    let part = this.getNextMidiParts().get(midiChannel)
    if (part == undefined) {
      log.debug('Creating new part')
      part = new Tone.Part<MidiNote>(playNote_callback, notes)
      part.mute = true
      part.start(0) // schedule events on the Tone timeline
      part.loop = true
      part.loopEnd = sequenceDuration_toneTime.toBarsBeatsSixteenths()
      this.getNextMidiParts().set(midiChannel, part)
    } else {
      part.mute = true
      part.clear()
      notes.forEach((noteEvent) => {
        part.add(noteEvent)
      })
      part.loopEnd = sequenceDuration_toneTime.toBarsBeatsSixteenths()
    }

    // schedule the pedal
    const pedalControlChanges = midiTrack.controlChanges[64]
    if (pedalControlChanges != undefined) {
      let controlChangesPart = this.getNextControlChanges().get(midiChannel)
      if (controlChangesPart == undefined) {
        controlChangesPart = new Tone.Part<ControlChange>(
          this.triggerPedalCallback,
          pedalControlChanges
        )
        controlChangesPart.mute = true
        controlChangesPart.start(0)
        controlChangesPart.loop = true
        controlChangesPart.loopEnd = sequenceDuration_toneTime.toBarsBeatsSixteenths()
        this.getNextControlChanges().set(midiChannel, controlChangesPart)
      } else {
        controlChangesPart.mute = true
        controlChangesPart.clear()
        pedalControlChanges.forEach((controlChange: ControlChange) => {
          controlChangesPart.add(controlChange)
        })
        controlChangesPart.loopEnd = sequenceDuration_toneTime.toBarsBeatsSixteenths()
      }
    }
  }

  private midiRequestWithData(
    url: string,
    data?: Document | BodyInit,
    method = 'GET'
  ): Promise<[Midi, string]> {
    return new Promise<[Midi, string]>((success, fail) => {
      const request = new XMLHttpRequest()
      request.open(method, url)
      request.responseType = 'arraybuffer'
      // decode asynchronously
      request.addEventListener(
        'load',
        () => {
          if (request.readyState === 4 && request.status === 200) {
            const blob = new Blob([request.response], { type: 'audio/x-midi' })
            const blobURL: string = URL.createObjectURL(blob)
            success([new Midi(request.response), blobURL])
          } else {
            fail(request.status)
          }
        },
        { once: true }
      )
      request.addEventListener('error', fail, { once: true })
      request.send(data)
    })
  }

  // FIXME(theis): critical bug in MIDI scheduling
  // timing becomes completely wrong at high tempos
  // should implement a MusicXML to Tone.js formatter instead, using
  // musical rhythm notation rather than concrete seconds-based timing
  async loadMidi(
    serverURL: string,
    musicXML: XMLDocument,
    sequenceDuration_toneTime: Tone.TimeClass
  ): Promise<string> {
    const serializer = new XMLSerializer()
    const payload = serializer.serializeToString(musicXML)

    $(document).ajaxError((error) => console.log(error))

    const midiBlobURL = this.midiRequestWithData(serverURL, payload, 'POST')
      .then(([midi, blobURL]) => {
        if (!this.transport.loop) {
          this.transport.loop = true
          this.transport.loopStart = 0
        }
        this.transport.loopEnd = sequenceDuration_toneTime.toBarsBeatsSixteenths()

        // assumes constant BPM or defaults to 120BPM if no tempo information available
        const BPM =
          midi.header.tempos.length > 0 ? midi.header.tempos[0].bpm : 120
        if (!midi.header.timeSignatures[0]) {
          // TODO insert warning wrong Flask server
          // TODO create a test for the flask server
        }
        // must set the Transport BPM to that of the midi for proper scheduling
        // TODO(theis): this will probably lead to phase-drift if repeated
        // updates are performed successively, should catch up somehow on
        // the desynchronisation introduced by this temporary tempo change
        this.transport.bpm.value = BPM

        // Required for Tone.Time conversions to properly work
        this.transport.timeSignature =
          midi.header.timeSignatures[0].timeSignature

        midi.tracks.forEach((track, index) => {
          // midiChannels start at 1
          const midiChannel = index + 1
          this.scheduleTrackToInstrument(
            sequenceDuration_toneTime,
            track,
            midiChannel
          )
        })

        // change Transport BPM back to the displayed value
        // FIXME(theis): if this.bpmControl.value is a floor'ed value, this is wrong
        this.transport.bpm.value = this.bpmControl.value

        this.switchTracks()
        return blobURL
      })
      .catch((error) => {
        console.log(error)
        return ''
      })

    return midiBlobURL
  }

  scheduleChordsPlayer(midiChannel: number, locator: SheetLocator): void {
    // schedule callback to play the chords contained in the OSMD
    const useChordsInstruments = true

    const playChord = (time: number) => {
      const currentStep = this.quartersProgress()
      if (currentStep % 2 == 0) {
        const chord =
          locator.chordSelectors[Math.floor(currentStep / 2)].currentChord
        const events = Chord.makeNoteEvents(chord, time, Tone.Time('2n'), 0.5)
        const playNote = this.getPlayNoteByMidiChannel(
          midiChannel,
          useChordsInstruments
        )
        events.forEach((event) =>
          playNote(time, {
            name: event.name,
            duration: this.transport.toSeconds(event.duration),
            velocity: event.velocity,
          })
        )
      }
    }

    // FIXME(@tbazin): assumes a TimeSignature of 4/4
    new Tone.Loop(playChord, '4n').start(0)
  }

  disposeScheduledParts(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.midiParts.forEach((parts) => parts.forEach((part) => part.dispose()))
      resolve()
    })
  }
}
