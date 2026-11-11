export function groupSize(value,fallback=5){const n=Number(value);return Number.isFinite(n)&&n>0?Math.max(3,Math.min(15,Math.round(n))):fallback;}
export function preferredGroupSize(settings={},mode='learn'){return mode==='review'?groupSize(settings.reviewGroupSize,10):groupSize(settings.learnGroupSize??settings.groupSize,5);}
