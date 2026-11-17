// A row of checkboxes for picking categories or tags.
export default function TagCheckboxList({ tags, selectedTags, keyPrefix, onToggle }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
      {tags.map((tag) => (
        <label key={`${keyPrefix}-${tag}`} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <input
            type="checkbox"
            checked={selectedTags?.includes(tag)}
            onChange={() => onToggle(tag)}
          />
          {tag}
        </label>
      ))}
    </div>
  )
}
