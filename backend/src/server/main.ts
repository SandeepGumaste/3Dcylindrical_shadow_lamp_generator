import 'dotenv/config';
import { createServer } from './routes';

const port = Number(process.env.PORT) || 3001;
const server = createServer();
server.listen(port, () => console.log(`api on http://localhost:${port}`));

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
