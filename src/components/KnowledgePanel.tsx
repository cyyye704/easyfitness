import type { KnowledgeItem } from '../types'

type KnowledgePanelProps = {
  items: KnowledgeItem[]
}

export function KnowledgePanel({ items }: KnowledgePanelProps) {
  return (
    <section className="panel knowledge-panel" aria-labelledby="knowledge-title">
      <div className="section-heading">
        <span className="eyebrow">Course / 01</span>
        <h2 id="knowledge-title">减脂通识课程</h2>
        <p className="section-description">
          先理解身体如何响应热量、营养、训练与恢复，再开始记录每一天。
        </p>
      </div>

      <div className="knowledge-grid">
        {items.map((item, index) => (
          <article key={item.title} className="knowledge-card">
            <span className="knowledge-index">
              {String(index + 1).padStart(2, '0')}
            </span>
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
