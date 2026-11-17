// Search field shared by the "Matretter" and "Lag meny" pages.
export default function RecipeSearchField({ id, value, onChange, marginBottom }) {
  return (
    <section style={{ marginBottom }}>
      <label htmlFor={id} style={{ display: 'block', marginBottom: '8px' }}>
        Søk etter tag eller ingrediens:
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Søk på navn, kategori, tag eller ingrediens"
        style={{ width: '100%', padding: '10px', fontSize: '16px', boxSizing: 'border-box' }}
      />
    </section>
  )
}
