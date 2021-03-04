// Code for the melodic LFO function
// Create LFO controls and map them to trigger periodic regenerations server-side

import * as Nexus from 'nexusui'

export function createLFOControls(): void {
  const LFOControlsGridElem: HTMLDivElement = document.createElement('div')
  LFOControlsGridElem.id = 'lfo-controls'
  document.body.appendChild(LFOControlsGridElem)

  const LFOToggleElem: HTMLElement = document.createElement('div')
  LFOToggleElem.id = 'LFO-toggle'
  LFOControlsGridElem.appendChild(LFOToggleElem)

  const LFORateElem: HTMLElement = document.createElement('div')
  LFORateElem.id = 'LFO-rate'
  LFOControlsGridElem.appendChild(LFORateElem)

  const LFOValueElem: HTMLElement = document.createElement('div')
  LFOValueElem.id = 'LFO-value'
  LFOControlsGridElem.appendChild(LFOValueElem)

  const lfoToggle = new Nexus.Toggle('#LFO-toggle', {
    size: [40, 20],
    state: false,
  })
  let useLFO = false
  lfoToggle.on('change', (toggleOn) => {
    useLFO = toggleOn
  })

  LFOToggleElem.style.setProperty('width', '100%')
  LFOToggleElem.style.setProperty('padding-top', '30px')

  const LFONameElem = document.createElement('div')
  LFONameElem.textContent = 'Improvizer'
  LFOToggleElem.appendChild(LFONameElem)
  LFONameElem.style.setProperty('padding-top', '25px')

  const lfoRateDial = new Nexus.Dial('#LFO-rate', {
    interaction: 'vertical',
  })
  const LFORateNameElem = document.createElement('div')
  LFORateNameElem.textContent = 'Rate'
  LFORateElem.appendChild(LFORateNameElem)

  const lfoValueDial = new Nexus.Dial('#LFO-value', {
    interaction: 'vertical',
  })
  const LFOValueNameElem = document.createElement('div')
  LFOValueNameElem.textContent = 'Value'
  LFOValueElem.appendChild(LFOValueNameElem)
}

function triggerRegeneration(): void {
  throw Error('Not implemented')
}
