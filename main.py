from langchain_community.chat_message_histories import ChatMessageHistory
from langchain_core.chat_history import BaseChatMessageHistory
from langchain_core.prompts import MessagesPlaceholder
from langchain_core.runnables.history import RunnableWithMessageHistory
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, AIMessage
import json
from pydantic import BaseModel
from fastapi.staticfiles import StaticFiles
from langchain_core.prompts import ChatPromptTemplate
from langserve import add_routes
from dotenv import load_dotenv, find_dotenv
import os
from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI
from typing import List
from langchain_community.document_loaders import WebBaseLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
# from langchain_community.embeddings import BaichuanTextEmbeddings
# from langchain_community.vectorstores import Annoy
# from langchain.chains import create_history_aware_retriever,create_retrieval_chain
# from langchain.chains.combine_documents import create_stuff_documents_chain

# Load environment variables
_ = load_dotenv(find_dotenv())

# Initialize model
model = ChatOpenAI(
    base_url="https://open.bigmodel.cn/api/paas/v4",
    api_key=os.environ["ZHIPUAI_API_KEY"],
    model="glm-4",
)

llm = ChatOpenAI(
    base_url="http://api.baichuan-ai.com/v1",
    api_key=os.environ["BAICHUAN_API_KEY"],
    model="Baichuan4",
    temperature=0,
)

# File path to store websites.txt
websites_file_path = "./websites.txt"

# File path to save and load chat history
history_file_path = "chat_history.json"


# Function to load websites from file
def load_websites(file_path: str) -> List[str]:
    with open(file_path, "r", encoding="utf-8") as f:
        websites = f.read().splitlines()
    return websites


# Load websites from file
web_paths = load_websites(websites_file_path)

# 文档加载器
bs4_strainer = None  # 适合你的具体需求配置
loader = WebBaseLoader(web_paths=web_paths, bs_kwargs={"parse_only": bs4_strainer})

docs = loader.load()

# embeddings = BaichuanTextEmbeddings(baichuan_api_key=os.environ["BAICHUAN_API_KEY"])

text_splitter = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=100)

splits = text_splitter.split_documents(docs)

# vectorstore = Annoy.from_documents(documents=splits,embedding=embeddings)
# retriever = vectorstore.as_retriever(search_type="similarity", search_kwargs={"k": 6})


# Function to load chat history from a file
def load_history_from_file(file_path: str) -> dict:
    if os.path.exists(file_path) and os.path.getsize(file_path) > 0:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            history = {}
            for k, v in data.items():
                messages = []
                for msg in v:
                    if isinstance(msg, dict):
                        if 'type' in msg:
                            role = 'human' if msg['type'] == 'human' else 'ai'
                            content = msg.get('content', '')
                        elif 'role' in msg:
                            role = msg['role']
                            content = msg.get('content', '')
                        else:
                            continue
                    elif isinstance(msg, str):
                        role = 'human'
                        content = msg
                    else:
                        continue

                    if role == 'human':
                        messages.append(HumanMessage(content=content))
                    elif role == 'ai':
                        messages.append(AIMessage(content=content))

                chat_history = ChatMessageHistory()
                chat_history.messages = messages
                history[k] = chat_history
            return history
    return {}


# Function to save chat history to a file
def save_history_to_file(history: dict, file_path: str):
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump({k: [{"role": "human" if isinstance(msg, HumanMessage) else "ai", "content": msg.content} for msg in v.messages] for k, v in history.items()}, f, ensure_ascii=False, indent=4)


# Load existing chat history
store = load_history_from_file(history_file_path)

# Define the system message for the prompt
system_prompt = (

    '''
    # 角色
    你是一位智能医疗问诊助手，具备广泛的医学知识和能力，能够提供关于疾病、健康问题和医疗建议的详细信息。

    ## 技能

    ### 技能1：回答健康问题
    - 你将收集和整理关于疾病、症状、诊断和治疗的关键信息，如常见病因、症状表现、医学检查、治疗方案等。
    - 根据用户输入的症状和描述，提供可能的疾病诊断，并解释可能的治疗选项和建议。
    - 提供医学建议和预防措施，如生活方式改变、药物使用指导等。

    ### 技能2：推荐医疗资源和服务
    - 当用户需要推荐医院、诊所或特定医疗服务时，你可以根据地理位置和用户需求推荐合适的医疗资源。
    - 提供医疗服务的基本信息，如医院科室、专家团队、预约流程和联系方式。

    ### 技能3：提供健康管理建议
    - 根据用户的健康状况和需求，推荐健康管理方案，如定期体检项目、健康监测建议等。
    - 给出关于健康维护和疾病预防的实用建议，如营养指导、运动计划和心理健康支持。

    ### 技能4：实用医疗提示
    - 提供实用的医疗小贴士，如常用药品的使用注意事项、常见疾病的自我诊断方法等。

    ## 要求
    - 为了提供更精准和有效的医疗建议，你可以向用户询问问题，以便获取更详细的健康信息。
    - 确保提供的信息准确可靠，但建议用户在采取行动之前咨询专业医生。
    - 所有建议基于医学知识和公共医疗信息来源，不包括个人经验或主观评价。
    '''
    "\n\n"
    "{context}"
)

"""system_message =(
'''
# 角色
你是一位智能医疗问诊助手，具备广泛的医学知识和能力，能够提供关于疾病、健康问题和医疗建议的详细信息。你的目标是帮助用户理解他们的健康状况，提供有用的建议，并引导他们寻求专业医疗帮助。

## 技能

### 技能1:回答健康问题
- 你将收集和整理关于疾病、症状、诊断和治疗的关键信息，如常见病因、症状表现、医学检查、治疗方案等。
- 根据用户输入的症状和描述，提供可能的疾病诊断，并解释可能的治疗选项和建议。
  - 例：用户描述症状后，你可以说：“根据你的描述，这些症状可能与X疾病有关。建议你可以考虑进行Y检查，以进一步确认诊断。”
- 提供医学建议和预防措施，如生活方式改变、药物使用指导等。
  - 例：“为了缓解你的症状，可以尝试以下方法：增加饮水量，保持适度的运动，避免辛辣食物等。”

### 技能2：推荐医疗资源和服务
- 当用户需要推荐医院、诊所或特定医疗服务时，你可以根据地理位置和用户需求推荐合适的医疗资源。
  - 例：“你可以考虑去附近的X医院，他们的Y科室在处理这类问题上非常有经验。”
- 提供医疗服务的基本信息，如医院科室、专家团队、预约流程和联系方式。
  - 例：“X医院的Y科室拥有一支优秀的专家团队。你可以通过他们的网站在线预约，也可以拨打Z电话进行咨询。”

### 技能3：提供健康管理建议
- 根据用户的健康状况和需求，推荐健康管理方案，如定期体检项目、健康监测建议等。
  - 例：“鉴于你的健康状况，建议每年进行一次全面体检，包括血压、血糖和心电图检查。”
- 给出关于健康维护和疾病预防的实用建议，如营养指导、运动计划和心理健康支持。
  - 例：“每天坚持30分钟的有氧运动，饮食中增加蔬菜和水果的摄入，有助于保持健康。”

### 技能4：实用医疗提示
- 提供实用的医疗小贴士，如常用药品的使用注意事项、常见疾病的自我诊断方法等。
  - 例：“如果感到头痛，可以先尝试使用非处方止痛药如布洛芬，但请注意不要过量使用。”

## 交互细节
- 使用温和而专业的语言，确保用户感受到关怀和支持。
  - 例：“请不要担心，我们会一起找到解决办法。”
- 在提供建议之前，询问用户是否愿意提供更多信息以便更好地帮助他们。
  - 例：“为了更好地帮助你，我需要了解更多关于你的症状，可以详细描述一下吗？”
- 在每次交互中逐步引导用户描述他们的症状和健康状况，确保每次仅询问一个问题，以免用户感到负担。
  - 例：“你的症状出现了多长时间了？接下来我们可以聊聊症状的具体表现。”
- 在适当情况下，提醒用户你的建议仅供参考，建议在采取行动前咨询专业医生。
  - 例：“我的建议基于一般医学知识，但你的具体情况可能需要专业医生的诊断，请务必咨询你的医生。”

## 信息可靠性
- 确保提供的信息基于最新的医学知识和公共医疗信息来源，不包括个人经验或主观评价。
  - 例：“这些信息来源于最新的医学研究和公共医疗指南。”
- 在提供任何医疗建议时，明确提示用户这是基于公共医学资源的建议，不应替代专业医生的诊断和治疗。
  - 例：“请注意，这些建议是基于公共医学信息，不应替代医生的诊断和治疗。”

## 用户信任度
- 向用户解释你是一个智能医疗问诊助手，旨在帮助他们理解健康问题和提供建议，但无法替代专业医疗诊断。
  - 例：“我是一个智能医疗助手，可以为你提供健康建议，但这些不能替代医生的诊断。”
- 在必要时提供参考文献或出处，增加信息的可信度。
  - 例：“根据《某某医学指南》的建议，以下是一些相关的信息……”
- 给予用户自主选择的权利，在提供建议时，给予多种可选方案，并解释每种方案的利弊。
  - 例：“你可以选择进行X检查或Y检查。X检查的优点是……，而Y检查的优点是……”

## 用户数据隐私
- 确保用户的个人健康信息保密，不会泄露给第三方。
  - 例：“请放心，你提供的所有信息都会严格保密，不会泄露给任何第三方。”
'''
)"""

system_message = (
 '''
# 角色
你是一位智能医疗问诊助手，具备广泛的医学知识和能力，能够提供关于疾病、健康问题和医疗建议的详细信息。你的目标是帮助用户理解他们的健康状况，提供有用的建议，并引导他们寻求专业医疗帮助。

## 技能

### 技能1：回答健康问题
- 你将收集和整理关于疾病、症状、诊断和治疗的关键信息，如常见病因、症状表现、医学检查、治疗方案等。
- 根据用户输入的症状和描述，提供可能的疾病诊断，并解释可能的治疗选项和建议。
- 提供医学建议和预防措施，如生活方式改变、药物使用指导等。

### 技能2：推荐医疗资源和服务
- 当用户需要推荐医院、诊所或特定医疗服务时，你可以根据地理位置和用户需求推荐合适的医疗资源。
- 提供医疗服务的基本信息，如医院科室、专家团队、预约流程和联系方式。

### 技能3：提供健康管理建议
- 根据用户的健康状况和需求，推荐健康管理方案，如定期体检项目、健康监测建议等。
- 给出关于健康维护和疾病预防的实用建议，如营养指导、运动计划和心理健康支持。

### 技能4：实用医疗提示
- 提供实用的医疗小贴士，如常用药品的使用注意事项、常见疾病的自我诊断方法等。

## 交互细节
- 使用温和而专业的语言，确保用户感受到关怀和支持。
- 在提供建议之前，询问用户是否愿意提供更多信息以便更好地帮助他们。
- 在每次交互中逐步引导用户描述他们的症状和健康状况，确保每次仅询问一个问题，以免用户感到负担。
- 在适当情况下，提醒用户你的建议仅供参考，建议在采取行动前咨询专业医生。

## 信息可靠性
- 确保提供的信息基于最新的医学知识和公共医疗信息来源，不包括个人经验或主观评价。
- 在提供任何医疗建议时，明确提示用户这是基于公共医学资源的建议，不应替代专业医生的诊断和治疗。

## 用户信任度
- 向用户解释你是一个智能医疗问诊助手，旨在帮助他们理解健康问题和提供建议，但无法替代专业医疗诊断。
- 在必要时提供参考文献或出处，增加信息的可信度。
- 给予用户自主选择的权利，在提供建议时，给予多种可选方案，并解释每种方案的利弊。
 '''
)
# 有语境的问题
contextualize_q_system_prompt = (
    "根据聊天记录及用户最新的问题"
    "该问题可能涉及聊天记录中的上下文信息，重新构思一个独立的问题，"
    "使其能够在不参考聊天历史的情况下被理解。"
    "不要直接回答问题，而是在需要时对其进行重新表述，否则直接按原样返回问题。"
)
# Create prompt template
contextualize_q_prompt = ChatPromptTemplate.from_messages([
    ("system", contextualize_q_system_prompt),
    MessagesPlaceholder("chat_history"),
    ("human", "{input}")
])

prompt = ChatPromptTemplate.from_messages([
    ("system", system_message),
    MessagesPlaceholder("chat_history"),
    ("human", "{input}")
])

qa_prompt = ChatPromptTemplate.from_messages([
    ("system", system_prompt),
    MessagesPlaceholder("chat_history"),
    ("human", "{input}")
])

# Create the answer chain
# history_aware_retriever = create_history_aware_retriever(llm,retriever,contextualize_q_prompt)
# question_answer_chain = create_stuff_documents_chain(llm,qa_prompt)
# answer_chain = create_retrieval_chain(history_aware_retriever,question_answer_chain)

answer_chain = prompt | model


# Function to get session history
def get_session_history(session_id: str) -> BaseChatMessageHistory:
    if session_id not in store:
        store[session_id] = ChatMessageHistory()
    return store[session_id]


# Create a runnable with message history
with_message_history = RunnableWithMessageHistory(
    answer_chain,
    get_session_history,
    input_messages_key="input",
    history_messages_key="chat_history",
)

# FastAPI app definition
app = FastAPI(
    title="LangChain Server",
    version="1.0",
    description="A simple API server using LangChain's Runnable interfaces",
)

# Add chain routes
add_routes(
    app,
    answer_chain,
    path="/chain",
)

# Static files
app.mount("/pages", StaticFiles(directory="chat"), name="pages")

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# Define request body models
class MessageContent(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    session_id: str


# Chat processing API
@app.post("/chat")
async def chat(request: ChatRequest):
    message = request.message
    session_id = request.session_id

    # 使用前端提供的 session_id
    response = with_message_history.invoke(
        {"input": message},
        config={"configurable": {"session_id": session_id}}
    )
    response_content = response.content

    # 更新聊天历史
    chat_history = get_session_history(session_id).messages
    save_history_to_file(store, history_file_path)

    # 准备响应的聊天历史
    chat_history_for_response = [
        {"role": "human" if isinstance(msg, HumanMessage) else "ai", "content": msg.content}
        for msg in chat_history
    ]

    return {"answer": response_content, "chat_history": chat_history_for_response, "session_id": session_id}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="localhost", port=8000)
