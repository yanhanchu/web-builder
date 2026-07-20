import { Link } from 'react-router-dom';
import { allComponents } from '@workspace/ui/lib/generator/component-registry';
import { homeStyles as s } from '@workspace/ui/styles/generator/home-styles';

export function Home() {
  const totalProps = allComponents.reduce((sum, c) => sum + c.props.length, 0);
  const requiredProps = allComponents.reduce(
    (sum, c) => sum + c.props.filter((p) => p.required).length,
    0
  );

  return (
    <div>
      <header className={s.hero}>
        <p className={s.eyebrow}>由 react-docgen-typescript 於編譯期解析</p>
        <h1 className={s.title}>組件文件</h1>
        <p className={s.lede}>
          掃描 <code className={s.ledeCode}>src/components</code>，抽取每個組件的 props、型別與 JSDoc 說明，
          靜態生成成本零、載入即讀取。點進任一組件即可即時預覽其真實渲染結果。
        </p>

        <dl className={s.stats}>
          <div className={s.stat}>
            <dt className={s.statLabel}>組件數</dt>
            <dd className={s.statValue}>{allComponents.length}</dd>
          </div>
          <div className={s.stat}>
            <dt className={s.statLabel}>Props 總數</dt>
            <dd className={s.statValue}>{totalProps}</dd>
          </div>
          <div className={s.stat}>
            <dt className={s.statLabel}>必填 Props</dt>
            <dd className={s.statValue}>{requiredProps}</dd>
          </div>
        </dl>
      </header>

      <div className={s.grid}>
        {allComponents.map((c) => (
          <Link key={c.id} to={`/components/${c.id}`} className={s.card}>
            <div className={s.cardTop}>
              <h2 className={s.cardTitle}>{c.componentName}</h2>
              <span className={s.countBadge}>{c.props.length} props</span>
            </div>
            <p className={s.cardDesc}>{c.description || '沒有說明文字'}</p>
            <div className={s.cardMeta}>
              <code className={s.path}>{c.filePath}</code>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
