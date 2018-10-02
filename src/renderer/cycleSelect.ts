// Create select element with a list of icons

import * as path from 'path';

import '../common/styles/cycleSelect.scss';

export default class CycleSelect {
    static containerCssClass: string = 'CycleSelect-container';
    static innerContainerCssClass: string = 'CycleSelect-inner-container';
    static visibleCssClass: string = 'CycleSelect-visible';

    readonly containerElement: HTMLElement;
    readonly innerContainerElement: HTMLDivElement;
    readonly onchangeCallback: EventListenerObject;
    readonly basePath: string;
    readonly icons: Map<string, string>;
    readonly options: string[];

    private _selectElem: HTMLSelectElement;

    constructor(containerElement: HTMLElement,
        selectElemID: string,
        onchangeCallback: EventListenerObject,
        icons: Map<string,string>, basePath: string='') {
            if (!(icons.size > 0)) {
                // TODO define specific error object
                throw Error("Must provide a non-empty list of options");
            }
            if (containerElement.id === '') {
                // TODO define specific error object
                throw Error("Must set an id for the provided container element");
            }

            let self = this;
            // the icons are a key-value map where the key is the option name and
            // the value is the path to the icon
            this.containerElement = containerElement;
            this.containerElement.classList.add(CycleSelect.containerCssClass);
            this.innerContainerElement = document.createElement('div');
            this.innerContainerElement.classList.add(
                CycleSelect.innerContainerCssClass);
            this.containerElement.appendChild(this.innerContainerElement);

            this._selectElem = document.createElement('select');
            this._selectElem.style.visibility = 'hidden';
            this._selectElem.id = selectElemID;
            this.innerContainerElement.appendChild(this._selectElem);

            let copyCallback = onchangeCallback;
            copyCallback.handleEvent = copyCallback.handleEvent.bind(this);
            this.onchangeCallback = copyCallback;

            this.icons = icons;
            this.basePath = basePath;
            this.options = Array.from(this.icons.keys());

            this.populateSelect();
            this.populateContainer();

            this._selectElem.addEventListener('change', (e) => {
                self.updateVisuals();
                self.onchangeCallback.handleEvent.bind(self._selectElem)(e);
            });
            this.innerContainerElement.addEventListener('click',
                (e: MouseEvent) => {
                    self.cycleOptions.bind(self)();
                }
            )

            this.value = this.options[0];
        };

    private makeOptionId(key: string): string {
        return this.containerElement.id + '--' + key;
    }

    public get value(): string {
        return this.options[parseInt(this._selectElem.value)];
    }

    public set value(newValue: string) {
        if (!(this.options.includes(newValue))) {
            throw EvalError('Unauthorized value' + newValue + ' for CycleSelector');
        };
        this._selectElem.value = this.options.indexOf(newValue).toString();
        this._selectElem.dispatchEvent(new Event('change'));
    }

    private updateVisuals() {
        // display current icon
        $(`#${this.containerElement.id} img`).removeClass(CycleSelect.visibleCssClass);

        this.getCurrentElement().classList.toggle(CycleSelect.visibleCssClass,
            true);
    };

    private getCurrentElement(): HTMLElement {
        return <HTMLElement>document.getElementById(this.makeOptionId(this.value));
    }

    private populateContainer(): void {
        let self = this;
        this.icons.forEach((iconPath, instrumentName) => {
            let optionElem = document.createElement('img');
            optionElem.id = this.makeOptionId(instrumentName);
            optionElem.src = path.join(this.basePath, iconPath);
            self.containerElement.appendChild(optionElem);
        })
    };

    private populateSelect(): void {
        let self = this;
        this.options.forEach((optionName, optionIndex) => {
            let newOption = document.createElement('option');
            newOption.value = optionIndex.toString();
            newOption.textContent = optionName;
            self._selectElem.appendChild(newOption);
        })
    }

    private cycleOptions(): void {
        const currentOptionIndex: number = this.options.indexOf(this.value);
        const newIndex: number = (currentOptionIndex+1) % this.options.length;
        this.value = this.options[newIndex];
    }
}
