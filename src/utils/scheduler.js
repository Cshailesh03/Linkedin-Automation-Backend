// utils/scheduler.js
import ScheduledPost from '../models/ScheduledPost.js';
import Organization from '../models/Organization.js';
import schedule from 'node-schedule';
import * as linkedinService from '../services/linkedin.service.js';
import fs from 'fs/promises';

// Store scheduled jobs in memory
const scheduledJobs = new Map();

// Initialize scheduled jobs on server restart
export const initializeScheduledJobs = async () => {
  try {
    console.log('🔄 Initializing scheduled jobs...');

    const scheduledPosts = await ScheduledPost.find({
      status: 'scheduled',
      scheduleTime: { $gt: new Date() },
    }).populate('orgId');

    for (const post of scheduledPosts) {
      try {
        const postJob = async () => {
          try {
            const org = post.orgId;

            if (!org?.accessToken) {
              console.error(`❌ No access token for organization ${org._id}`);
              await ScheduledPost.findByIdAndUpdate(post._id, {
                status: 'failed',
                error: 'LinkedIn access token not found',
              });
              return;
            }

            // Load files if any
            let filesToPost = [];
            if (post.imageFiles && post.imageFiles.length > 0) {
              for (const fileInfo of post.imageFiles) {
                try {
                  const buffer = await fs.readFile(fileInfo.path);
                  filesToPost.push({
                    buffer,
                    mimetype: fileInfo.mimetype,
                    originalname: fileInfo.filename,
                  });
                } catch (err) {
                  console.error(`Error reading file ${fileInfo.path}:`, err);
                }
              }
            }

            // Post to LinkedIn
            const result = await linkedinService.postToLinkedInWithFilesUGC(
              org._id,
              post.message,
              post.imageUrls || [],
              filesToPost
            );

            console.log('✅ Scheduled content posted to LinkedIn:', result);

            // Update scheduled post status
            await ScheduledPost.findByIdAndUpdate(post._id, {
              status: 'posted',
              linkedinPostId: result.id,
              postedAt: new Date(),
            });

            // Clean up saved files
            if (post.imageFiles) {
              for (const fileInfo of post.imageFiles) {
                try {
                  await fs.unlink(fileInfo.path);
                } catch (err) {
                  console.error('Error deleting file:', err);
                }
              }
            }

            // Remove job from memory
            scheduledJobs.delete(post.jobName);
          } catch (error) {
            console.error('❌ Error in scheduled post:', error);

            await ScheduledPost.findByIdAndUpdate(post._id, {
              status: 'failed',
              error: error.message,
            });

            scheduledJobs.delete(post.jobName);
          }
        };

        // Schedule the job
        const job = schedule.scheduleJob(post.jobName, post.scheduleTime, postJob);

        if (job) {
          scheduledJobs.set(post.jobName, job);
          console.log(`✅ Scheduled job ${post.jobName} for ${post.scheduleTime}`);
        } else {
          console.error(`❌ Failed to schedule job ${post.jobName}`);
          await ScheduledPost.findByIdAndUpdate(post._id, {
            status: 'failed',
            error: 'Failed to reschedule job after server restart',
          });
        }
      } catch (error) {
        console.error(`Error initializing job for post ${post._id}:`, error);
      }
    }

    console.log(`✅ Initialized ${scheduledPosts.length} scheduled jobs`);

    // Clean up expired posts
    const expiredPosts = await ScheduledPost.find({
      status: 'scheduled',
      scheduleTime: { $lte: new Date() }
    });

    if (expiredPosts.length > 0) {
      console.log(`🧹 Cleaning up ${expiredPosts.length} expired scheduled posts`);
      
      for (const expiredPost of expiredPosts) {
        await ScheduledPost.findByIdAndUpdate(expiredPost._id, {
          status: 'failed',
          error: 'Post schedule time expired during server downtime'
        });

        if (expiredPost.imageFiles) {
          for (const fileInfo of expiredPost.imageFiles) {
            try {
              await fs.unlink(fileInfo.path);
            } catch (err) {
              console.error('Error deleting expired post file:', err);
            }
          }
        }
      }
    }

  } catch (error) {
    console.error('❌ Error initializing scheduled jobs:', error);
  }
};

// Export scheduledJobs Map for controller access
export { scheduledJobs };
