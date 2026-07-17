import { useState } from 'react'
import type { KnowledgeItem } from '../types'

type KnowledgePanelProps = {
  items: KnowledgeItem[]
}

type CourseView = 'modules' | 'lesson' | 'overview'

export function KnowledgePanel({ items }: KnowledgePanelProps) {
  const [view, setView] = useState<CourseView>('modules')
  const [moduleIndex, setModuleIndex] = useState(0)
  const [cardIndex, setCardIndex] = useState(0)

  const selectedModule = items[moduleIndex]
  const selectedCard = selectedModule?.cards[cardIndex]
  const totalCards = items.reduce((total, item) => total + item.cards.length, 0)

  const openModule = (index: number) => {
    setModuleIndex(index)
    setCardIndex(0)
    setView('lesson')
  }

  const showModules = () => {
    setView('modules')
    setCardIndex(0)
  }

  const showOverview = () => setView('overview')

  const showNextCard = () => {
    if (!selectedModule) {
      showModules()
      return
    }

    if (cardIndex < selectedModule.cards.length - 1) {
      setCardIndex((current) => current + 1)
      return
    }

    if (moduleIndex < items.length - 1) {
      setModuleIndex((current) => current + 1)
      setCardIndex(0)
      return
    }

    showOverview()
  }

  if (items.length === 0) {
    return null
  }

  return (
    <section className="panel knowledge-panel" aria-labelledby="knowledge-title">
      {view === 'modules' && (
        <>
          <div className="section-heading knowledge-heading-row">
            <div>
              <span className="eyebrow">Course / 01</span>
              <h2 id="knowledge-title">减脂通识课程</h2>
              <p className="section-description">
                先把最重要的规则弄明白，再开始控制热量。共 {items.length} 个模块、
                {totalCards} 条知识卡。
              </p>
            </div>
            <button type="button" className="course-text-button" onClick={showOverview}>
              知识总览
            </button>
          </div>

          <div className="knowledge-grid">
            {items.map((item, index) => (
              <button
                type="button"
                key={item.title}
                className="knowledge-card course-module-card"
                onClick={() => openModule(index)}
                aria-label={`进入${item.title}模块，共 ${item.cards.length} 条知识`}
              >
                <span className="knowledge-index">
                  MODULE {String(index + 1).padStart(2, '0')}
                </span>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                <span className="course-module-meta">
                  {item.cards.length} 条知识 <b aria-hidden="true">→</b>
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {view === 'lesson' && selectedModule && selectedCard && (
        <div className="course-lesson-view">
          <div className="course-view-header">
            <button type="button" className="course-text-button" onClick={showModules}>
              ← 返回模块
            </button>
            <span className="course-position">
              {selectedModule.title} · {cardIndex + 1}/{selectedModule.cards.length}
            </span>
          </div>

          <progress
            className="course-progress"
            value={cardIndex + 1}
            max={selectedModule.cards.length}
            aria-label={`${selectedModule.title}学习进度`}
          />

          <article
            className="course-lesson-card"
            key={`${moduleIndex}-${cardIndex}`}
            aria-live="polite"
          >
            <span className="eyebrow">
              Knowledge / {String(cardIndex + 1).padStart(2, '0')}
            </span>
            <h2 id="knowledge-title">{selectedCard.title}</h2>
            <p className="course-lesson-summary">{selectedCard.summary}</p>
            <ul>
              {selectedCard.details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
            <div className="course-takeaway">
              <span>记住这一句</span>
              <strong>{selectedCard.takeaway}</strong>
            </div>
          </article>

          <div className="course-actions">
            <button type="button" className="primary-button" onClick={showNextCard}>
              下一条
            </button>
            <button type="button" className="course-skip-button" onClick={showOverview}>
              我都知道，不需要你教我做事
            </button>
          </div>
        </div>
      )}

      {view === 'overview' && (
        <div className="knowledge-overview">
          <div className="course-view-header knowledge-overview-header">
            <div>
              <span className="eyebrow">Course / Overview</span>
              <h2 id="knowledge-title">减脂知识总览</h2>
              <p className="section-description">
                所有核心知识放在一起，适合快速复习，不需要按顺序阅读。
              </p>
            </div>
            <button type="button" className="course-text-button" onClick={showModules}>
              返回课程模块
            </button>
          </div>

          <div className="knowledge-overview-groups">
            {items.map((item, index) => (
              <section className="knowledge-overview-group" key={item.title}>
                <div className="knowledge-overview-group-heading">
                  <span className="knowledge-index">
                    MODULE {String(index + 1).padStart(2, '0')}
                  </span>
                  <h3>{item.title}</h3>
                  <button type="button" onClick={() => openModule(index)}>
                    从本模块开始
                  </button>
                </div>
                <div className="knowledge-overview-grid">
                  {item.cards.map((card) => (
                    <article className="knowledge-overview-card" key={card.title}>
                      <h4>{card.title}</h4>
                      <p>{card.summary}</p>
                      <strong>{card.takeaway}</strong>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <p className="course-disclaimer">
            这些内容用于一般健康教育，不替代个体化医疗建议。未成年人、孕期或哺乳期人群，以及有慢性病、进食障碍或相关症状的人，应优先咨询合格专业人员。
          </p>
        </div>
      )}
    </section>
  )
}
