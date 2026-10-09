import { useEffect, useMemo, useState } from 'react'
import { Label, TextArea } from './Field'
import { SearchSelect } from './SearchSelect'

type StateData = { name: string; cities: string[] }
let cache: StateData[] | null = null

/** Indian states / UTs and their cities, loaded on first use (kept out of the main bundle). */
function useIndiaStates() {
  const [data, setData] = useState<StateData[] | null>(cache)
  useEffect(() => {
    if (cache) return
    void import('@/data/india-states-cities.json').then((m) => {
      cache = m.default as StateData[]
      setData(cache)
    })
  }, [])
  return data
}

export type AddressValue = { address: string; state: string; city: string }

/**
 * The standard address block used everywhere:
 * full address, State (searchable list of Indian states / UTs), City (searchable, follows the state).
 */
export function AddressFields({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string
  value: AddressValue
  onChange: (v: AddressValue) => void
}) {
  const states = useIndiaStates()
  const stateOptions = useMemo(() => (states ?? []).map((s) => ({ value: s.name, label: s.name })), [states])
  const cityOptions = useMemo(
    () => (states?.find((s) => s.name === value.state)?.cities ?? []).map((c) => ({ value: c, label: c })),
    [states, value.state],
  )

  return (
    <>
      <div>
        <Label htmlFor={`${idPrefix}-address`}>Full address</Label>
        <TextArea
          id={`${idPrefix}-address`}
          rows={2}
          placeholder="Optional"
          value={value.address}
          onChange={(e) => onChange({ ...value, address: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
        <div>
          <Label htmlFor={`${idPrefix}-state`}>State</Label>
          <SearchSelect
            id={`${idPrefix}-state`}
            value={value.state || null}
            options={stateOptions}
            placeholder={states ? 'Select state' : 'Loading…'}
            searchPlaceholder="Search state"
            onChange={(s) => {
              const next = s ?? ''
              const keepCity = states?.find((x) => x.name === next)?.cities.includes(value.city)
              onChange({ ...value, state: next, city: keepCity ? value.city : '' })
            }}
          />
        </div>
        <div>
          <Label htmlFor={`${idPrefix}-city`}>City</Label>
          <SearchSelect
            id={`${idPrefix}-city`}
            value={value.city || null}
            options={cityOptions}
            disabled={!value.state}
            allowCustom
            placeholder={value.state ? 'Select city' : 'Select state first'}
            searchPlaceholder="Search city"
            emptyText="No matching city. Type the full name to add it."
            onChange={(c) => onChange({ ...value, city: c ?? '' })}
          />
        </div>
      </div>
    </>
  )
}
