import type { KnowledgeItem } from '../types'

type KnowledgePanelProps = {
  items: KnowledgeItem[]
}

export function KnowledgePanel({ items }: KnowledgePanelProps) {
  return (
    <section className="panel knowledge-panel" aria-labelledby="knowledge-title">
      <div className="section-heading">
        <span className="eyebrow">Basics</span>
        <h2 id="knowledge-title">减脂通识</h2>
      </div>

      <div className="knowledge-grid">
        {items.map((item) => (
          <article key={item.title} className="knowledge-card">
            <h3>{item.title}</h3>
            <ul>
              {item.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  )
}
