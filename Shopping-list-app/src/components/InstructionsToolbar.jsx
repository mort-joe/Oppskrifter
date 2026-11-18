const FORMAT_BUTTONS = [
  { type: 'bold', label: 'Fet' },
  { type: 'italic', label: 'Kursiv' },
  { type: 'heading', label: 'Overskrift' },
  { type: 'bullet', label: 'Punkt' },
]

// Formatting buttons above a recipe-text textarea. onFormat receives the format type.
export default function InstructionsToolbar({ onFormat }) {
  return (
    <div className="recipe-format-toolbar" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
      {FORMAT_BUTTONS.map((button) => (
        <button key={button.type} type="button" className="recipe-format-btn" onClick={() => onFormat(button.type)}>
          {button.label}
        </button>
      ))}
    </div>
  )
}
