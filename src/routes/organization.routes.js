import express from "express";
import {
  createOrganization,
  getAllOrganizations,
  getOrganizationById,
  deleteOrganization,
} from "../controllers/organization.controller.js";

const router = express.Router();

router.post("/", createOrganization);         // POST /api/organizations
router.get("/", getAllOrganizations);         // GET /api/organizations
router.get("/:id", getOrganizationById);      // GET /api/organizations/:id
router.delete('/organizations/:id', deleteOrganization); 

export default router;
