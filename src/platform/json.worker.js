self.onmessage=event=>{
 try{self.postMessage({value:JSON.parse(event.data)});}
 catch(error){self.postMessage({error:error.message});}
};
