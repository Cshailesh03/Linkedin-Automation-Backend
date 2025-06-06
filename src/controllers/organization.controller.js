// controllers/organization.controller.js
import Organization from "../models/Organization.js";
import {asyncHandler} from "../utils/asyncHandler.js";
import {ApiError} from "../utils/ApiError.js";
import {ApiResponse} from "../utils/ApiResponse.js";

// Create a new organization
export const createOrganization = asyncHandler(async (req, res) => {
  const { name, linkedinClientId, linkedinClientSecret, linkedinRedirectUri } = req.body;

  if (!name || !linkedinClientId || !linkedinClientSecret || !linkedinRedirectUri) {
    throw new ApiError(400, "All fields are required");
  }

  const newOrg = await Organization.create({
    name,
    linkedinClientId,
    linkedinClientSecret,
    linkedinRedirectUri,
  });

  res.status(201).json(new ApiResponse(201, newOrg, "Organization created successfully"));
});

// Get all organizations
export const getAllOrganizations = asyncHandler(async (req, res) => {
  const orgs = await Organization.find();
  res.status(200).json(new ApiResponse(200, orgs, "Organizations fetched"));
});

// Get a specific organization by ID
export const getOrganizationById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const org = await Organization.findById(id);

  if (!org) {
    throw new ApiError(404, "Organization not found");
  }

  res.status(200).json(new ApiResponse(200, org, "Organization found"));
});

// Delete an organization by ID
export const deleteOrganization = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const org = await Organization.findById(id);
  if (!org) {
    throw new ApiError(404, "Organization not found");
  }

  await Organization.findByIdAndDelete(id);

  res.status(200).json(new ApiResponse(200, null, "Organization deleted successfully"));
});