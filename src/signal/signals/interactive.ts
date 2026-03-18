/**
 * Signals for interactive components (Buttons, Lists, Carousels).
 */

export function buttons(text: string, footer: string, buttons: any[], options: any = {}) {
  return (engine: any) => ({
    text,
    footer,
    buttons: buttons.map(b => ({
      buttonId: b.id,
      buttonText: { displayText: b.text },
      type: 1
    })),
    headerType: 1,
    ...options
  })
}

export function list(text: string, footer: string, title: string, buttonText: string, sections: any[], options: any = {}) {
  return (engine: any) => ({
    text,
    footer,
    title,
    buttonText,
    sections,
    ...options
  })
}
