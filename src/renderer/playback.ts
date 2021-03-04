// <reference path='./jquery-exists.d.ts'/>

import * as Tone from 'tone'
import * as log from 'loglevel'

import LinkClient from './ableton_link/linkClient'
import { Locator } from './locator'

log.setLevel(log.levels.INFO)

export interface MinimalPlaybackManager {
  play(): Promise<unknown>
  stop(): Promise<void>
}

abstract class TonePlaybackManager implements MinimalPlaybackManager {
  readonly safeStartDuration: Tone.Unit.Time = '+0.1'

  // adds a small delay to ensure playback as recommended in the Tone.js docs
  protected safeStartPlayback(): void {
    Tone.getTransport().start(this.safeStartDuration)
  }

  async play() {
    await Tone.getContext().resume()
    // start the normal way
    this.safeStartPlayback()
  }

  protected stopSound(): void {
    Tone.getTransport().stop()
  }

  async stop() {
    await Tone.getContext().resume()
    this.stopSound()
  }
}

abstract class VisualPlaybackManager<
  VisualLocator extends Locator
> extends TonePlaybackManager {
  protected locator: VisualLocator

  get Locator(): VisualLocator {
    return this.locator
  }

  protected setPlaybackPositionDisplay(progress: number): void {
    this.Locator.setCurrentlyPlayingPositionDisplay(progress)
  }

  protected nowPlayingDisplayCallback(_: any, progress: number): void {
    // scroll display to current step if necessary
    this.setPlaybackPositionDisplay(progress)
  }

  // retrieve index of the current display-step
  protected abstract getCurrentDisplayTimestep(): number

  protected updateCursorPosition(): void {
    const progress: number = Tone.getTransport().progress
    this.nowPlayingDisplayCallback(null, progress)
  }

  protected scheduleDisplayLoop(toneDisplayUpdateInterval: string): void {
    // initialize playback display scheduler
    const self = this
    const drawCallback = (time) => {
      // DOM modifying callback should be put in Tone.getDraw() scheduler!
      // see: https://github.com/Tonejs/Tone.js/wiki/Performance#syncing-visuals
      Tone.getDraw().schedule(function () {
        self.updateCursorPosition()
      }, time)
    }

    // schedule quarter-notes clock
    log.debug('Scheduling draw callback sequence')
    // FIXME assumes a TimeSignature of 4/4
    new Tone.Loop(drawCallback, toneDisplayUpdateInterval).start(0)
  }

  protected resetPlaybackPositionDisplay(): void {
    this.setPlaybackPositionDisplay(0)
  }

  // Stop playback immediately and reset position display
  async stop() {
    await super.stop()
    this.resetPlaybackPositionDisplay()
  }
}

abstract class SynchronizedPlaybackManager extends TonePlaybackManager {
  // Start playback immediately at the beginning of the song
  protected startPlaybackNowFromBeginning(): void {
    Tone.getTransport().start('+0.03', '0:0:0')
  }

  // Start playback either immediately or in sync with Link if Link is enabled
  async play() {
    await Tone.getContext().resume()
    if (!LinkClient.isEnabled()) {
      // start the normal way
      this.safeStartPlayback()
    } else {
      log.info('LINK: Waiting for `downbeat` message...')
      // wait for Link-socket to give downbeat signal
      await LinkClient.once('downbeat', async () => {
        this.startPlaybackNowFromBeginning()
      })
      log.info('LINK: Received `downbeat` message, starting playback')
    }
  }

  // Set the position in the current measure to the provided phase
  // TODO(theis): should we use the `link.quantum` value?
  synchronizeToLink(): void {
    if (Tone.getTransport().state == 'started' && LinkClient.isEnabled()) {
      const currentMeasure = this.getCurrentMeasure().toString()
      Tone.getTransport().position =
        currentMeasure + ':' + LinkClient.getPhaseSynchronous().toString()
    }
  }

  // Helper function to access the current measure in the Transport
  protected getCurrentMeasure(): number {
    const currentMeasure = Tone.getTransport().position.toString().split('')[0]
    return parseInt(currentMeasure)
  }

  // Quick-and-dirty automatic phase-locking to Ableton Link
  protected scheduleAutomaticResync() {
    new Tone.Loop(() => {
      this.synchronizeToLink()
    }, '3m').start('16n')
  }
}

export interface PlaybackManager<VisualLocator extends Locator>
  extends TonePlaybackManager,
    VisualPlaybackManager<VisualLocator>,
    SynchronizedPlaybackManager {}

export abstract class PlaybackManager<VisualLocator extends Locator> {
  constructor(locator: VisualLocator, toneDisplayUpdateInterval = '4n') {
    this.locator = locator
    this.scheduleAutomaticResync()
    this.scheduleDisplayLoop(toneDisplayUpdateInterval)
  }
}
applyMixins(PlaybackManager, [
  TonePlaybackManager,
  VisualPlaybackManager,
  SynchronizedPlaybackManager,
])

// as found in the TypeScript documentation
// https://www.typescriptlang.org/docs/handbook/mixins.html
function applyMixins(derivedCtor: any, baseCtors: any[]) {
  baseCtors.forEach((baseCtor) => {
    Object.getOwnPropertyNames(baseCtor.prototype).forEach((name) => {
      Object.defineProperty(
        derivedCtor.prototype,
        name,
        Object.getOwnPropertyDescriptor(baseCtor.prototype, name)
      )
    })
  })

  return derivedCtor
}
