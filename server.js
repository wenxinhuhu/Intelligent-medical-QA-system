const express = require('express');  
const mysql = require('mysql');  
const bodyParser = require('body-parser'); 
const path = require('path'); // 引入path模块   
  
const app = express();  
const PORT = 3000;  

// MySQL连接配置  
const connection = mysql.createConnection({  
    host: 'localhost',  
    user: 'root',  
    password: '123456',  
    database: 'huatuo'
});  
  
connection.connect(err => {  
    if (err) throw err;  
    console.log('Connected to MySQL database.');  
});  
  
app.use(bodyParser.json());  
app.use(bodyParser.urlencoded({ extended: true }));  

//登录路由
app.post('/login', (req, res) => {  
    const { username, password } = req.body;  
    const sql = 'SELECT * FROM users WHERE user_id = ?';  
    connection.query(sql, [username], (err, results) => {  
        if (err) throw err;  
        if (results.length > 0 && results[0].password === password) {  
            res.send({ success: true, message: '登录成功' });  
        } else if (results.length === 0) {  
            res.send({ success: false, message: '请先注册信息！' });  
        } else {  
            res.send({ success: false, message: '密码错误！' });  
        }  
    });  
});  
// 注册路由  
app.post('/register', (req, res) => {  
    const { username, password, confirmPassword,username1 } = req.body;  
  
    if (!username) {  
        return res.status(400).send({ success: false, message: '账号不能为空！' });  
    }  
    if (!username1) {  
        return res.status(400).send({ success: false, message: '用户名不能为空！' });  
    }  
    if (password !== confirmPassword) {  
        return res.status(400).send({ success: false, message: '两次输入的密码不一致，请重新输入！' });  
    }  
  
    const sql = 'INSERT INTO users (user_id,username, password,created_at) VALUES (?,?,?,NOW())';  
    connection.query(sql, [username,username1, password], (err, results) => {  
        if (err) throw err;  
        if (results.affectedRows > 0) {  
            res.send({ success: true, message: '注册成功！' });  
        } else {  
            res.send({ success: false, message: '注册失败，请稍后再试！' });  
        }  
    });  
});  
  
app.use(express.static(path.join(__dirname, 'login1')));
app.listen(PORT, () => {  
    console.log(`Server is running on port ${PORT}`);  
});