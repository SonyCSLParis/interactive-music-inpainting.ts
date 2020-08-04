import LinkClient from './linkClient';

import Nexus from './nexusColored';

export function render() {
    let topControlsGridElem = document.getElementById('bottom-controls')
    let linkbuttonElem: HTMLElement = document.createElement('control-item');
    linkbuttonElem.id = 'link-button'
    topControlsGridElem.appendChild(linkbuttonElem);

    let linkbutton = new Nexus.TextButton('#link-button',{
        'size': [150,50],
        'state': false,
        'text': 'Enable LINK',
        'alternateText': 'Disable LINK'
    });

    linkbutton.on('change', (enable) => {
        if (enable) {
            LinkClient.enable();
        }
        else {
            LinkClient.disable()
        }
    });
}

let linkDisplayTimeout;
export function renderDownbeatDisplay(): void{
    let topControlsGridElem = document.getElementById('bottom-controls')
    let linkdisplayElem: HTMLElement = document.createElement('control-item');
    linkdisplayElem.id = 'link-display';
    linkdisplayElem.style.pointerEvents = 'none';
    topControlsGridElem.appendChild(linkdisplayElem);

    let linkdisplayButton = new Nexus.Button('#link-display',{
        'size': [40, 40],
        'state': false,
        'mode': 'button'
    });

    LinkClient.on('downbeat', () => {
        linkdisplayButton.down();
        if (linkDisplayTimeout) clearTimeout(linkDisplayTimeout);
        linkDisplayTimeout = setTimeout(() => linkdisplayButton.up(), 100)}
    )
}
