const { Pool } = require('pg');
const bcrypt = require('bcrypt');
require('dotenv').config({ path: '../.env' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function createAdmin() {
  const username = 'admin';
  const password = 'password123'; // Mật khẩu bạn sẽ dùng để đăng nhập

  try {
    // Kiểm tra xem người dùng đã tồn tại chưa
    const existingUser = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (existingUser.rows.length > 0) {
      console.log(`Người dùng '${username}' đã tồn tại.`);
      return;
    }

    // Băm mật khẩu
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    console.log('Mật khẩu đã được băm.');

    // Thêm người dùng vào cơ sở dữ liệu
    await pool.query(
      'INSERT INTO users (username, password) VALUES ($1, $2)',
      [username, hashedPassword]
    );

    console.log(`Đã tạo thành công người dùng: '${username}' với mật khẩu: '${password}'`);
    console.log('Bây giờ bạn có thể dùng tài khoản này để đăng nhập.');

  } catch (error) {
    console.error('Đã xảy ra lỗi khi tạo người dùng:', error);
  } finally {
    await pool.end();
  }
}

createAdmin();
