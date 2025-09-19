import pg from 'pg';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;

// Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function createOrUpdateUser() {
  // Lấy tên người dùng và mật khẩu từ dòng lệnh
  const [,, username, password] = process.argv;

  if (!username || !password) {
    console.error('Vui lòng cung cấp tên người dùng và mật khẩu.');
    console.log('Cách dùng: node scripts/create-or-update-user.mjs <username> <password>');
    process.exit(1);
  }

  try {
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Kiểm tra xem người dùng đã tồn tại chưa
    const existingUser = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    
    if (existingUser.rows.length > 0) {
      // Nếu tồn tại, cập nhật mật khẩu
      await pool.query('UPDATE users SET password = $1 WHERE username = $2', [hashedPassword, username]);
      console.log(`Đã cập nhật mật khẩu thành công cho người dùng: '${username}'.`);
    } else {
      // Nếu không tồn tại, tạo người dùng mới
      await pool.query(
        'INSERT INTO users (username, password) VALUES ($1, $2)',
        [username, hashedPassword]
      );
      console.log(`Đã tạo thành công người dùng: '${username}'.`);
    }

  } catch (error) {
    console.error('Đã xảy ra lỗi:', error);
  } finally {
    await pool.end();
  }
}

createOrUpdateUser();
