import { Link } from 'react-router-dom';
import { allFunctions } from '@workspace/ui/lib/generator/function-registry';
import { homeStyles as s } from '@workspace/ui/styles/generator/home-styles';

export function FunctionsHome() {
  const totalParams = allFunctions.reduce((sum, f) => sum + f.params.length, 0);
  const asyncCount = allFunctions.filter((f) => f.isAsync).length;

  return (
    <div>
      <header className={s.hero}>
        <p className={s.eyebrow}>由 ts-morph 於編譯期解析</p>
        <h1 className={s.title}>函式文件</h1>
        <p className={s.lede}>
          掃描 <code className={s.ledeCode}>src/functions</code>，抽取每個函式的參數、回傳型別、JSDoc 說明與相關型別定義，
          靜態生成成本零、載入即讀取。
        </p>

        <dl className={s.stats}>
          <div className={s.stat}>
            <dt className={s.statLabel}>函式數</dt>
            <dd className={s.statValue}>{allFunctions.length}</dd>
          </div>
          <div className={s.stat}>
            <dt className={s.statLabel}>參數總數</dt>
            <dd className={s.statValue}>{totalParams}</dd>
          </div>
          <div className={s.stat}>
            <dt className={s.statLabel}>Async 函式</dt>
            <dd className={s.statValue}>{asyncCount}</dd>
          </div>
        </dl>
      </header>

      <div className={s.grid}>
        {allFunctions.map((f) => (
          <Link key={f.id} to={`/functions/${f.id}`} className={s.card}>
            <div className={s.cardTop}>
              <h2 className={s.cardTitle}>{f.functionName}</h2>
              <span className={s.countBadge}>{f.params.length} params</span>
            </div>
            <p className={s.cardDesc}>{f.description || '沒有說明文字'}</p>
            <div className={s.cardMeta}>
              <code className={s.path}>{f.filePath}</code>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
