let conversations = []; // 存储所有对话
let currentConversation = null; // 当前活动的对话
let lastUserMessage = ''; // 记录用户最后一条消息
const urlParams = new URLSearchParams(window.location.search); 
const user_id = urlParams.get('username');

 if (user_id) { 
 console.log('Username from URL:', user_id); 
 } 

async function initializeChat() {
    if (user_id) {
        loadConversationsFromDatabase(user_id); // 从数据库加载对话
        startNewConversation(); // 开始新对话
    } else {
        console.error('User ID is missing in the URL.');
    }
}
// 发送按钮点击事件
document.querySelector("#input-send").addEventListener("click", sendMessage);

// 输入框的键盘事件
document.querySelector("#chat-input").addEventListener("keydown", handleKeyDown);

function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault(); // 阻止默认的换行行为
        sendMessage(); // 发送消息
    }
}

// 发送消息
function sendMessage() {
    const text = document.querySelector("#chat-input").value.trim();

    if (!text) {
        return; // 如果输入为空，直接返回
    }

    // 清空输入框
    document.querySelector("#chat-input").value = '';

    // 发送请求到后端
    sendRequest(text);
}

// 发送请求到后端
function sendRequest(text, isRegenerated = false) {
    if (!text.trim()) {
        return; // 如果输入为空，直接返回
    }

    // 构建请求数据
    const data = {
        message: text,
        session_id: currentConversation ? currentConversation.id.toString() : Date.now().toString() // 使用当前对话的ID或者新创建的时间戳作为ID
    };

    // 如果不是重新生成的消息，添加用户消息到聊天框
    if (!isRegenerated) {
        appendMessage('user', text, new Date().toLocaleString('zh-CN', { hour12: false }), false); // 用户消息不使用动画效果

        // 更新最后用户消息并将消息保存到当前对话
        lastUserMessage = text;
        if (currentConversation) {
            const timestamp = new Date().toLocaleString('zh-CN', { hour12: false });
            currentConversation.messages.push({ sender: 'user', message: text, timestamp });
            currentConversation.lastUserMessage = text; // 更新本对话的最后一条用户消息
            currentConversation.time = timestamp; // 更新对话时间戳
            saveConversationToDatabase(currentConversation);
            updateConversationList(); // 更新对话列表
        }
    }

    // 发送请求到后端
    fetch("http://localhost:8000/chat", {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    }).then(response => {
        if (response.ok) {
            return response.json(); // 解析 JSON 响应
        } else {
            console.error('Network response was not ok.');
            return Promise.reject('Network response was not ok.');
        }
    }).then(data => {
        // 处理从后端收到的响应
        handleResponseFromBackend(data);
    }).catch(error => {
        console.error('Fetch error:', error);
    });
}

// 处理后端返回的响应
function handleResponseFromBackend(data) {
    if (data && data.answer) {
        const aiMessage = data.answer;
        const timestamp = new Date().toLocaleString('zh-CN', { hour12: false });
        appendMessage('chatgpt', aiMessage, timestamp, true); // AI 消息使用动画效果逐字显示

        // 将 AI 响应保存到当前对话
        if (currentConversation) {
            currentConversation.messages.push({ sender: 'chatgpt', message: aiMessage, timestamp });
            currentConversation.time = timestamp; // 更新对话时间戳
            saveConversationToDatabase(currentConversation);
            updateConversationList(); // 更新对话列表
        }
    } else {
        console.error('Invalid response data:', data);
    }
}

// 重新生成消息
function regenerateMessage() {
    if (lastUserMessage && currentConversation) {
        const lastMessageIndex = currentConversation.messages.length - 1;
        const lastMessage = currentConversation.messages[lastMessageIndex];
        if (lastMessage && lastMessage.sender === 'chatgpt') {
            // 删除最后一条 AI 消息
            currentConversation.messages.splice(lastMessageIndex, 1);
            const lastMessageElement = document.querySelectorAll('.chat-message.chatgpt')[document.querySelectorAll('.chat-message.chatgpt').length - 1];
            if (lastMessageElement) {
                lastMessageElement.remove();
            }
            // 重新发送请求以获取新的响应
            sendRequest(lastUserMessage, true);
        }
    }
}

// 开始新对话
function startNewConversation() {
    if (currentConversation) {
        saveConversationToDatabase(currentConversation); // 保存当前对话到数据库
    }

    // 创建新对话对象
    const newConversation = {
        //id: Date.now().toString(), // 使用时间戳作为ID
        id:new Date().toLocaleString('zh-CN', { hour12: false }),
        time: new Date().toLocaleString('zh-CN', { hour12: false }),
        messages: [], // 初始化空消息列表
        lastUserMessage: '' // 初始化最后用户消息为空字符串
    };

    conversations.push(newConversation); // 将新对话添加到对话列表
    currentConversation = newConversation; // 将新对话设为当前活动对话
    updateConversationList(); // 更新对话列表显示
    clearChat(); // 清空聊天框

    // 发送欢迎消息
    const welcomeMessage = "你身体有什么问题尽管问，华佗都能帮你解决。";
    const timestamp = new Date().toLocaleString('zh-CN', { hour12: false });
    appendMessage('chatgpt', welcomeMessage, timestamp, true); // 欢迎消息使用动画效果逐字显示
}

// 更新左侧对话列表
function updateConversationList() {
    const todayContainer = document.getElementById('today-conversations');
    const sevenDaysContainer = document.getElementById('seven-days-conversations');
    const thirtyDaysContainer = document.getElementById('thirty-days-conversations');

    todayContainer.innerHTML = '';
    sevenDaysContainer.innerHTML = '';
    thirtyDaysContainer.innerHTML = '';

    const now = new Date();
    const sortedConversations = [...conversations].sort((a, b) => new Date(b.time) - new Date(a.time));

    sortedConversations.forEach(convo => {
        const convoElement = document.createElement('div');
        convoElement.classList.add('conversation');
        const firstUserMessage = convo.messages.find(msg => msg.sender === 'user');
        const displayText = firstUserMessage ? firstUserMessage.message.slice(0, 10) + '...' : '新对话';
        /*const timeElement = document.createElement('div');
        timeElement.classList.add('message-timestamp');
        const lastMessage = convo.messages[convo.messages.length - 1];
        timeElement.textContent = lastMessage ? lastMessage.timestamp : '';*/

        convoElement.textContent = displayText;
        /*convoElement.appendChild(timeElement);*/
        convoElement.onclick = () => loadConversation(convo.id);

        const convoDate = new Date(convo.time);
        const diffTime = Math.abs(now - convoDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays <= 1) {
            todayContainer.appendChild(convoElement);
        } else if (diffDays <= 7) {
            sevenDaysContainer.appendChild(convoElement);
        } else if (diffDays <= 30) {
            thirtyDaysContainer.appendChild(convoElement);
        }
    });
}

// 加载指定ID的对话
function loadConversation(id) {
    if (currentConversation && currentConversation.id === id) {
        return; // 如果要加载的是当前活动对话，直接返回
    }

    const convo = conversations.find(c => c.id === id);
    if (convo) {
        currentConversation = convo; // 设定当前活动对话为找到的对话
        clearChat(); // 清空聊天框
        convo.messages.forEach(msg => appendMessage(msg.sender, msg.message, msg.timestamp)); // 加载对话中的所有消息
    }
}

// 清空聊天框
function clearChat() {
    const chatBody = document.getElementById('chat-body');
    chatBody.innerHTML = ''; // 清空聊天内容
}

// 添加消息到聊天框
function appendMessage(sender, message, timestamp, isAnimated = false) {
    const chatBody = document.getElementById('chat-body');
    const messageElement = document.createElement('div');
    messageElement.classList.add('chat-message', sender);

    const senderElement = document.createElement('div');
    senderElement.classList.add('message-sender');
    const senderImg = document.createElement('img');
    senderImg.src = sender === 'user' ? 'user.jpg' : 'huatuo.jpg'; // 替换为实际的图片路径

    senderElement.appendChild(senderImg);  // 只添加头像

    const contentElement = document.createElement('div');
    contentElement.classList.add('message-content');
    if (isAnimated) {
        animateMessage(contentElement, message); // 如果启用动画效果，则逐字显示消息内容
    } else {
        contentElement.textContent = message; // 否则直接显示全部消息内容
    }

   /* const timestampElement = document.createElement('div');
    timestampElement.classList.add('message-timestamp');
    timestampElement.textContent = timestamp;*/

    const actionsElement = document.createElement('div');
    actionsElement.classList.add('message-actions');
    if (sender === 'chatgpt') {
        const likeButton = document.createElement('i');
        likeButton.className = 'iconfont icon-dianzan_kuai';
        likeButton.onclick = () => alert('点赞成功!');
        const copyButton = document.createElement('i');
        copyButton.className = 'iconfont icon-fuzhi';
        copyButton.onclick = () => {
            const currentMessage = messageElement.querySelector('.message-content').textContent;
            navigator.clipboard.writeText(currentMessage).then(() => {
                alert('已复制当前对话的内容');
            });
        };
        actionsElement.appendChild(likeButton);
        actionsElement.appendChild(copyButton);
       /* timestampElement.style.position = 'absolute'; // 设置时间戳的位置为绝对定位
        timestampElement.style.left = '10px'; // 将时间戳移动到左下角*/
    } else {
        /*timestampElement.style.position = 'absolute'; // 设置用户消息的时间戳位置
        timestampElement.style.right = '10px'; // 保持用户消息的时间戳在右下角*/
    }

    messageElement.appendChild(senderElement);
    messageElement.appendChild(contentElement);
   /* messageElement.appendChild(timestampElement);*/
    messageElement.appendChild(actionsElement);

    chatBody.appendChild(messageElement);
    chatBody.scrollTop = chatBody.scrollHeight;

}

// 动画效果：逐字显示消息内容
function animateMessage(element, message) {
    const characters = message.split('');
    characters.forEach((char, index) => {
        setTimeout(() => {
            element.textContent += char;
        }, index * 50); // 调整逐字显示的速度，这里是每个字符间隔 50ms 显示
    });
}

// 清除所有对话
function clearAllConversations() {
    conversations = [];
    currentConversation = null;
    updateConversationList();
    clearChat();
    clearConversationsFromDatabase();

    // 开始新对话
    startNewConversation();
}
// 删除当前对话
/*
function tideleteCurrentConversaon() {
    if (currentConversation) {
        const index = conversations.findIndex(c => c.id === currentConversation.id);
        if (index !== -1) {
            conversations.splice(index, 1);
            currentConversation = null;
            updateConversationList();
            clearChat();
            saveConversationsToDatabase();
        }
    }
}
*/
// 删除对话
/*
function deleteConversation(id) {
    const index = conversations.findIndex(c => c.id === id);
    if (index !== -1) {
        conversations.splice(index, 1);
        updateConversationList();
        clearChat();
        saveConversationsToDatabase();
    }
}
*/

//从数据库加载对话
async function loadConversationsFromDatabase(user_id) {
    try {
        const response = await fetch(`http://localhost:8001/conversations?user_id=${user_id}`);
        if (!response.ok) {
            throw new Error('Failed to load conversations from database.');
        }
        const data = await response.json();
        conversations = data.conversations || [];
        updateConversationList();
    } catch (error) {
        console.error('Error loading conversations from database:', error);
    }
}

// 保存所有对话到数据库
function saveConversationsToDatabase() {
    fetch('http://localhost:8001/conversations', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({user_id, conversations })
    }).then(response => {
        if (!response.ok) {
            throw new Error('Failed to save conversations to database.');
        }
        console.log('Conversations saved successfully.');
    }).catch(error => {
        console.error('Error saving conversations to database:', error);
    });
}

// 保存当前对话到数据库
function saveConversationToDatabase(conversation) {
    const filteredConversations = conversations.filter(c => c.id !== conversation.id);
    filteredConversations.push(conversation);
    conversations = filteredConversations;
    saveConversationsToDatabase();
}

// 删除所有对话
async function clearConversationsFromDatabase() {
    try {
        const userid = user_id; // 确保获得用户 ID
        const response = await fetch('http://localhost:8001/conversations', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${userid}` // 将 user_id 作为 Authorization 头传递
            }
        });

        if (!response.ok) {
            throw new Error('Failed to clear conversations from database.');
        }
        console.log('Conversations cleared successfully.');
    } catch (error) {
        console.error('Error clearing conversations from database:', error);
    }
}
// 初始化聊天应用
initializeChat();
// 退出函数，跳转到指定页面
function logout() {
    window.location.href = "http://127.0.0.1:3000/home_page.html";
}
