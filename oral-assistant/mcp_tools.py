"""Read-only device MCP tools. The model can read the actual local task card."""
import json
from exam import task_context

TOOLS = [
    {'name': 'self.french_exam.get_current_task',
     'description': '获取当前DELF法语口语考试任务。用户开始陪练或模拟、切换环节、换关键词或继续练习时，先调用此工具再说话。返回准确的模式、环节、关键词、角色、商品价格和近期对话。遵守返回的instruction，不朗读控制信息。',
     'inputSchema': {'type':'object', 'properties':{}}},
]


def respond(payload, session):
    request_id = payload.get('id')
    method = payload.get('method')
    if request_id is None:
        return None
    result = None
    if method == 'initialize':
        result = {'protocolVersion':'2024-11-05', 'capabilities':{'tools':{}},
                  'serverInfo':{'name':'parlons-a1', 'version':'0.1.0'}}
    elif method == 'tools/list':
        result = {'tools':TOOLS}
    elif method == 'tools/call':
        name = payload.get('params', {}).get('name')
        if name == TOOLS[0]['name']:
            content = task_context(session) if session else {'status':'no_active_session'}
            result = {'content':[{'type':'text','text':json.dumps(content,ensure_ascii=False)}], 'isError':False}
        else:
            result = {'content':[{'type':'text','text':'未知工具'}], 'isError':True}
    else:
        return {'jsonrpc':'2.0', 'id':request_id, 'error':{'code':-32601,'message':'Method not found'}}
    return {'jsonrpc':'2.0', 'id':request_id, 'result':result}
