import * as Tone from 'tone';
import * as WebMidi from 'webmidi';
import * as log from 'loglevel';

let Nexus = require('./nexusColored')

let dummyMidiOut = new Tone.Instrument();
dummyMidiOut.playNote = () => {};

let midiOut = dummyMidiOut;

export function render(useChordsInstrument: boolean = false) {
    let bottomControlsGridElem = document.getElementById('bottom-controls');
    let midiOutSelectElem: HTMLElement = document.createElement('control-item');
    midiOutSelectElem.id = 'select-midiout';
    bottomControlsGridElem.appendChild(midiOutSelectElem);

    (WebMidi as any).enable(function (err) {
        if (err) log.error(err);

        let midiOutSelect = new Nexus.Select('#select-midiout', {
            'size': [150, 50],
            'options': ['No Output'].concat(
                (WebMidi as any).outputs.map((output) => output.name)),
        });

        function midiOutOnChange(ev) {
            if (this.value !== 'No Output') {
                midiOut = (WebMidi as any).getOutputByName(this.value);
            }
            else {
                midiOut = dummyMidiOut;
            }
            log.info('Selected MIDI out: ' + this.value);
        };

        midiOutSelect.on('change', midiOutOnChange.bind(midiOutSelect));
        midiOutSelect.value = 'No Output';
    });
}


export function getOutput() {
    return midiOut
}
