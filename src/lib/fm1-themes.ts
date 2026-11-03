// Colors of the DECK's FM-1 front panel: the colors the real M-VAVE FM-1 ships in (approximated).
// Each theme fills the CSS variables the panel's styles read (DeckFm1Summary.vue).

export interface Fm1Theme {
  id: string
  label: string
  /** swatch shown in the picker */
  swatch: string
  vars: Record<string, string>
}

interface Palette {
  face: [string, string]   // front panel gradient (top, bottom)
  knob: [string, string]   // knob skirt ridges
  cap: [string, string]    // knob cap (highlight, shade)
  pointer: string
  well: string             // recess around the buttons
  btn: [string, string]
  btnText: string
  label: string
  on: [string, string]     // pressed button
}

function theme(id: string, label: string, p: Palette): Fm1Theme {
  return {
    id, label, swatch: p.face[0],
    vars: {
      '--fm1-face-a': p.face[0], '--fm1-face-b': p.face[1],
      '--fm1-knob-a': p.knob[0], '--fm1-knob-b': p.knob[1],
      '--fm1-cap-a': p.cap[0], '--fm1-cap-b': p.cap[1],
      '--fm1-pointer': p.pointer,
      '--fm1-well': p.well,
      '--fm1-btn-a': p.btn[0], '--fm1-btn-b': p.btn[1],
      '--fm1-btn-text': p.btnText,
      '--fm1-label': p.label,
      '--fm1-on-a': p.on[0], '--fm1-on-b': p.on[1],
    },
  }
}

const DARK_KNOB: Pick<Palette, 'knob' | 'cap' | 'pointer'> = {
  knob: ['#2a2b2f', '#3b3d42'], cap: ['#5b5e66', '#2f3136'], pointer: '#f4f4f5',
}
const CYAN_ON: [string, string] = ['#0e7490', '#155e75']

export const FM1_THEMES: Fm1Theme[] = [
  theme('grey', 'Grey', {
    face: ['#5d6066', '#50535a'], ...DARK_KNOB, well: '#2b2c30',
    btn: ['#5f6269', '#50535a'], btnText: '#d4d4d8', label: '#e5e7eb', on: CYAN_ON,
  }),
  theme('black', 'Black', {
    face: ['#26272b', '#1c1d20'], ...DARK_KNOB, well: '#111214',
    btn: ['#3a3c41', '#2e3034'], btnText: '#d4d4d8', label: '#d4d4d8', on: CYAN_ON,
  }),
  theme('white', 'White', {
    face: ['#ecebe6', '#dddcd6'], knob: ['#c9c8c2', '#dad9d3'], cap: ['#ffffff', '#cfcec8'], pointer: '#27272a',
    well: '#b9b8b2', btn: ['#f5f5f2', '#e2e1dc'], btnText: '#3f3f46', label: '#3f3f46', on: CYAN_ON,
  }),
  theme('purple', 'Purple', {
    face: ['#6d4f97', '#5c4184'], ...DARK_KNOB, well: '#33264a',
    btn: ['#7a5ca4', '#694c92'], btnText: '#ede9fe', label: '#f3e8ff', on: ['#d97706', '#b45309'],
  }),
  theme('orange', 'Orange', {
    face: ['#e2742c', '#cf6420'], ...DARK_KNOB, well: '#7a3510',
    btn: ['#ea8743', '#d97430'], btnText: '#fff7ed', label: '#fff7ed', on: CYAN_ON,
  }),
  theme('navy', 'Navy', {
    face: ['#2c3e66', '#233457'], ...DARK_KNOB, well: '#141d33',
    btn: ['#3a4f7c', '#2f426b'], btnText: '#dbeafe', label: '#e0e7ff', on: ['#d97706', '#b45309'],
  }),
  theme('green', 'Green', {
    face: ['#4f7a52', '#426a45'], ...DARK_KNOB, well: '#22382a',
    btn: ['#5d8a60', '#4e7a51'], btnText: '#ecfdf5', label: '#ecfdf5', on: ['#d97706', '#b45309'],
  }),
  theme('brown', 'Brown', {
    face: ['#7a5a40', '#694c35'], ...DARK_KNOB, well: '#3b2a1d',
    btn: ['#886850', '#765842'], btnText: '#fef3c7', label: '#fef3c7', on: CYAN_ON,
  }),
]

export const FM1_DEFAULT_THEME = 'grey'

export function fm1Theme(id: string | null | undefined): Fm1Theme {
  return FM1_THEMES.find(t => t.id === id) ?? FM1_THEMES.find(t => t.id === FM1_DEFAULT_THEME)!
}
