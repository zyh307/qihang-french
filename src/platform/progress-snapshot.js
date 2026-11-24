// Progress actions do not edit course content or derived conjugation cards.
// Keep those large read-only trees stable so every answer need not clone them
// or invalidate their indexes. Mutable learning records still get a full copy.
export function progressSnapshot(state){
 const {library,conjugationDecks,vocabularyMergeArchive,courseEntrySplitArchive,...mutable}=state;
 let next;try{next=structuredClone(mutable);}catch{next=JSON.parse(JSON.stringify(mutable));}
 next.library=library;
 if(conjugationDecks!==undefined)next.conjugationDecks=conjugationDecks;
 if(vocabularyMergeArchive!==undefined)next.vocabularyMergeArchive={...vocabularyMergeArchive};
 if(courseEntrySplitArchive!==undefined)next.courseEntrySplitArchive={...courseEntrySplitArchive};
 return next;
}

export function progressNeedsMaintenance(previous,next){
 const now=new Date(),today=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
 for(const field of ['words','reviews'])if((previous.activity?.[today]?.[field]?.length||0)!==(next.activity?.[today]?.[field]?.length||0))return true;
 if(Object.keys(previous.errors||{}).length!==Object.keys(next.errors||{}).length)return true;
 for(const [key,record] of Object.entries(next.progress||{})){const before=previous.progress?.[key];if(record.notebook!==before?.notebook||record.pendingLearning!==before?.pendingLearning)return true;}
 for(const [key,record] of Object.entries(next.errorHistory||{})){const before=previous.errorHistory?.[key];if(record.count!==before?.count||record.lastReviewDate!==before?.lastReviewDate||record.cycleReviews!==before?.cycleReviews)return true;}
 return false;
}
