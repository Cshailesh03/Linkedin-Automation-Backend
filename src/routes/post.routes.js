// routes/post.routes.js
import express from 'express';
import { getAllPosts } from '../controllers/postController.js';

const router = express.Router();

router.get('/posts/:orgId', getAllPosts); // GET /api/v1/posts/:orgId

export default router;