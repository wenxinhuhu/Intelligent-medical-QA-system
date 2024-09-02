const express = require('express');
const mysql = require('mysql');
const bodyParser = require('body-parser');
const path = require('path');
const app = express();
const cors = require('cors'); // 引入 cors

// 使用 cors 中间件
app.use(cors());

// 其他中间件和路由定义

const PORT = 8001; 

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'chat'))); // 新添加

const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: '123456',
    database: 'huatuo'
};

const connection = mysql.createConnection(dbConfig);

connection.connect((err) => {
    if (err) {
        console.error('Error connecting to MySQL database:', err);
        return;
    }
    console.log('Connected to MySQL database.');
});

app.get('/conversations', (req, res) => {
    const userId = req.query.user_id;
    if (!userId) {
      return res.status(400).json({ error: '需要用户 ID' });
    }
  
    const querySessions = 'SELECT * FROM sessions WHERE user_id = ?';
    connection.query(querySessions, [userId], (err, sessions) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
  
      const conversations = [];
      const fetchMessages = (index) => {
        if (index === sessions.length) {
          return res.json({ conversations });
        }
        const conversation =sessions[index];
        const queryMessages = 'SELECT * FROM messages WHERE session_id = ?';
        connection.query(queryMessages, [conversation.session_id], (err, messages) => {
          if (err) {
            return res.status(500).json({ error: err.message });
          }
         conversation.messages = messages; 
          conversations.push({
            id: conversation.session_id.toLocaleString('zh-CN', { hour12: false }),
            time: conversation.time.toLocaleString('zh-CN', { hour12: false }),
            messages: messages // 确保会话的消息被正确赋值
          });
          fetchMessages(index + 1);
        });
      };
  
      fetchMessages(0);
    });
  });

app.post('/conversations', (req, res) => {
    const { user_id, conversations } = req.body;

    if (!user_id || !conversations) {
        console.error('User ID and conversations are required');
        return res.status(400).json({ error: 'User ID and conversations are required' });
    }

    const insertSession = (session, callback) => {
        const insertSessionQuery = 'INSERT IGNORE INTO sessions (session_id, user_id, time) VALUES (?, ?, ?)';
        connection.query(insertSessionQuery, [session.id, user_id, session.time], (err) => {
            if (err) {
                console.error('Error inserting session:', err);
                return callback(new Error('Error inserting session: ' + err.message));
            }

            const insertMessages = (messages, callback) => {
                const filteredMessages = [];
                const seenUsers = new Set();

                messages.forEach(msg => {
                    filteredMessages.push(msg);
                });

                const insertMessageQuery = 'INSERT IGNORE INTO messages (session_id, sender, message, timestamp) VALUES ?';
                const values = filteredMessages.map(msg => [session.id, msg.sender, msg.message, msg.timestamp]);
                console.log('Inserting messages:', values); // 打印即将插入的消息数据

                connection.query(insertMessageQuery, [values], (err) => {
                    if (err) {
                        console.error('Error inserting messages:', err);
                        return callback(new Error('Error inserting messages: ' + err.message));
                    }
                    console.log('Messages inserted successfully'); // 插入成功后的日志
                    callback();
                });
            };

            insertMessages(session.messages, callback);
        });
    };

    const processSessions = (index) => {
        if (index === conversations.length) {
            console.log('All conversations processed successfully');
            return res.json({ message: 'Conversations saved successfully' });
        }

        insertSession(conversations[index], (err) => {
            if (err) {
                console.error('Error processing session:', err);
                return res.status(500).json({ error: err.message });
            }
            processSessions(index + 1);
        });
    };
    processSessions(0);
});


app.delete('/conversations', (req, res) => {
    const user_id = req.headers['authorization']?.split(' ')[1]; 
    if (!user_id) {
        return res.status(400).json({ error: 'User ID is required' });
    }

    // 删除用户的所有会话和消息
    const deleteMessagesQuery = 'DELETE FROM messages WHERE session_id IN (SELECT session_id FROM sessions WHERE user_id = ?)';
    connection.query(deleteMessagesQuery, [user_id], (err) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        const deleteSessionsQuery = 'DELETE FROM sessions WHERE user_id = ?';
        connection.query(deleteSessionsQuery, [user_id], (err) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({ message: 'Conversations cleared successfully' });
        });
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});