import { registerAs } from '@nestjs/config';

export default registerAs('database', () => (
  {
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT, 10) || 5432,
    name: process.env.DATABASE_NAME || 'nextgen_marketingai',
    user: process.env.DATABASE_USER || 'postgres',
    password: process.env.DATABASE_PASSWORD || 'postgres',
    url: process.env.DATABASE_URL,
  }
));
