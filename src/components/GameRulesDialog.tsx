import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export function GameRulesDialog({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  return (
    <>
      <button className={`rules-trigger ${compact ? 'compact' : ''}`} onClick={() => setOpen(true)}>？ 游戏规则</button>
      {open && typeof document !== 'undefined' && createPortal(
        <div className="rules-modal" role="dialog" aria-modal="true" aria-labelledby="rules-title" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
          <article className="rules-sheet">
            <button className="rules-close" aria-label="关闭规则说明" onClick={() => setOpen(false)}>×</button>
            <p className="eyebrow">新玩家快速入门</p>
            <h2 id="rules-title">《精灵收集家》游戏规则</h2>
            <p className="rules-lead">收集五行灵珠、捕捉精灵并建立永久羁绊。率先达到 15 声望，并在最终轮结束后保持领先即可获胜。</p>

            <section><b>1</b><div><h3>轮到你时选择一项行动</h3><ul><li>拿取 3 枚不同颜色的五行灵珠。</li><li>若公共区某色至少有 4 枚，可拿取该颜色 2 枚。</li><li>预定 1 张市集卡，或捕捉 1 张市集/预定卡。</li><li>只有完全没有合法行动时，才可以跳过回合。</li></ul></div></section>
            <section><b>2</b><div><h3>预定与万能灵珠</h3><ul><li>每人最多预定 3 张卡；预定本身不支付费用。</li><li>预定公开卡时，公共区若还有紫色灵珠，会自动获得 1 枚。</li><li>紫色灵珠不能直接拿取，购买时可以补足任意缺少的颜色。</li></ul></div></section>
            <section><b>3</b><div><h3>捕捉卡牌与永久羁绊</h3><ul><li>卡牌顶部的彩色灵珠表示捕捉后获得的永久羁绊颜色。</li><li>购买时先用永久羁绊自动减免同色费用，再消耗持有灵珠，最后使用万能灵珠补缺。</li><li>永久羁绊不会消耗，也不计入持有灵珠数量上限。</li></ul></div></section>
            <section><b>4</b><div><h3>灵珠上限与旅者徽章</h3><ul><li>回合结束时最多持有 10 枚灵珠，超过后必须归还至 10 枚。</li><li>徽章条件只统计永久羁绊；持有灵珠和万能灵珠不能代替。</li><li>捕捉精灵后满足条件，会自动获得对应徽章和声望。</li></ul></div></section>
            <section><b>5</b><div><h3>游戏结束与排名</h3><ul><li>有人达到 15 声望后触发最终轮，所有玩家完成相同回合数后结算。</li><li>若全部牌库和市集耗尽，也会完成本轮后结算。</li><li>同分时依次比较：捕捉卡较少者优先、持有万能灵珠较少者优先；仍相同则并列获胜。</li></ul></div></section>
            <section><b>6</b><div><h3>连续对局记录</h3><p>“再来一局”会保留本桌已完成局数和每位玩家胜场；结束本次对局并返回首页后记录清空。并列获胜者各记 1 胜。</p></div></section>

            <button className="primary" onClick={() => setOpen(false)}>明白了，开始游戏</button>
          </article>
        </div>,
        document.body,
      )}
    </>
  );
}
