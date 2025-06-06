import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import linkedinRoutes from './routes/linkedin.routes.js';
import organizationRoutes from "./routes/organization.routes.js";
import postRoutes from './routes/post.routes.js';

const app = express();

// CORS configuration
app.use(cors({ origin: '*' }));

// Middleware
app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: true, limit: '16kb' }));
app.use(express.static('public'));

// Routes
// app.js

app.use('/api/post', postRoutes);
app.use('/api/linkedin', linkedinRoutes);
app.use("/api/organizations", organizationRoutes);

export { app };
