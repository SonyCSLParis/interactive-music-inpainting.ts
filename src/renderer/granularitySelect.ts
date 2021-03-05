import { getPathToStaticFile } from './staticPath'
import * as ControlLabels from './controlLabels'
import { CycleSelect } from './cycleSelect'
import { SheetLocator } from './locator'

const availableGranularityIcons = new Map([
  ['1', 'quarter-note.svg'],
  ['2', 'half-note.svg'],
  ['4', 'whole.svg'],
  ['8', 'whole-two.png'],
  ['12', 'whole-three.png'],
  ['16', 'whole-four.png'],
])

function makeGranularityIconsList(
  granularities_quarters: string[]
): Map<string, string> {
  const granularitiesIcons = new Map()
  const sortedGranularities = granularities_quarters.sort()

  for (
    let granularity_index = 0, num_granularities = sortedGranularities.length;
    granularity_index < num_granularities;
    granularity_index++
  ) {
    const granularity = sortedGranularities[granularity_index]
    const iconName = availableGranularityIcons.has(granularity)
      ? availableGranularityIcons.get(granularity)
      : // TODO create better icon for unusual duration or simply use HTMLContent in button?
        'whole.svg'

    granularitiesIcons.set(granularity, iconName)
  }

  return granularitiesIcons
}

// Time-granularity selector
export function renderGranularitySelect(
  containerElement: HTMLElement,
  granularities_quarters: string[]
): void {
  const iconsBasePath: string = getPathToStaticFile('icons')
  const granularityIcons = makeGranularityIconsList(granularities_quarters)

  const granularitySelectContainerElement: HTMLElement = document.createElement(
    'control-item'
  )
  granularitySelectContainerElement.id = 'granularity-select-container'
  containerElement.appendChild(granularitySelectContainerElement)

  ControlLabels.createLabel(
    granularitySelectContainerElement,
    'granularity-select-label'
  )

  function granularityOnChange(ev) {
    const duration_quarters: number = parseInt(this.value)
    const durationCSSClass: string = SheetLocator.makeGranularityCSSClass(
      duration_quarters
    )
    $('.notebox').removeClass('active')
    $('.' + durationCSSClass + '> .notebox').addClass('active')
  }

  const granularitySelect = new CycleSelect(
    granularitySelectContainerElement,
    'granularity-select',
    { handleEvent: granularityOnChange },
    granularityIcons,
    iconsBasePath
  )

  granularitySelect.value = granularities_quarters[0]
}
