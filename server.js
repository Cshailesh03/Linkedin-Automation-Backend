import dotenv from "dotenv";
dotenv.config({ path: '../env' });

import connectDB from './src/config/db.js';
import { app } from './app.js';
import { initializeScheduledJobs } from './src/utils/scheduler.js';

connectDB()
  .then(async () => {
    // Initialize scheduled jobs after DB connection
    await initializeScheduledJobs();
    
    const PORT = process.env.PORT || 8000;
    app.listen(PORT, () => {
      console.log(`🚀 Server is running at port: ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ MONGO db connection failed!", err);
  });
