const finite=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;

// The all-words rows have a fixed CSS height. Grid rows contain one or two
// entries; spacers and slicing must use the same layout and loaded count.
export function notebookWindowRange({count,scrollTop=0,columns=1,rowHeight=64,viewportHeight=0}){
 const length=Math.max(0,Math.floor(finite(count,0))),cols=Math.max(1,Math.floor(finite(columns,1)));
 const height=Math.max(1,finite(rowHeight,64)),top=Math.max(0,finite(scrollTop,0)),viewport=Math.max(0,finite(viewportHeight,0));
 const rows=Math.ceil(length/cols),visibleRows=Math.min(rows,Math.max(32,Math.ceil(viewport/height)+16));
 const firstRow=Math.max(0,Math.min(Math.floor(top/height)-8,rows-visibleRows));
 const lastRow=Math.min(rows,firstRow+visibleRows);
 return {start:firstRow*cols,end:Math.min(length,lastRow*cols),head:firstRow*height,tail:(rows-lastRow)*height};
}
