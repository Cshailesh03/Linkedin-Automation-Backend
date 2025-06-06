import dotenv from "dotenv";
dotenv.config({ path: '../env' });

import connectDB from '../backend/config/db.js';
import { app } from '../backend/app.js';
import { initializeScheduledJobs } from '../backend/utils/scheduler.js';

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
