package api

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"

	"github.com/projuktisheba/erp-mini-api/internal/dbrepo"
	"github.com/projuktisheba/erp-mini-api/internal/models"
	"github.com/projuktisheba/erp-mini-api/internal/utils"
)

type BranchHandler struct {
	DB       *dbrepo.BranchRepo
	infoLog  *log.Logger
	errorLog *log.Logger
}

func NewBranchHandler(db *dbrepo.BranchRepo, infoLog *log.Logger, errorLog *log.Logger) *BranchHandler {
	return &BranchHandler{
		DB:       db,
		infoLog:  infoLog,
		errorLog: errorLog,
	}
}
func (h *BranchHandler) CreateBranchHandler(w http.ResponseWriter, r *http.Request) {
	var branch models.Branch

	if err := json.NewDecoder(r.Body).Decode(&branch); err != nil {
		utils.BadRequest(w, err)
		return
	}

	id, err := h.DB.CreateBranch(r.Context(), &branch)
	if err != nil {
		http.Error(w, "Failed to create branch", http.StatusInternalServerError)
		return
	}

	utils.WriteJSON(w, http.StatusCreated, map[string]any{
		"error":   false,
		"status":  "success",
		"message": "Branch created successfully",
		"id":      id,
	})
}

func (h *BranchHandler) GetBranchesHandler(w http.ResponseWriter, r *http.Request) {
	branches, err := h.DB.GetBranches(r.Context())
	if err != nil {
		http.Error(w, "Failed to fetch branches", http.StatusInternalServerError)
		return
	}

	utils.WriteJSON(w, http.StatusOK, map[string]any{
		"error":    false,
		"status":   "success",
		"message":  "Branches fetched successfully",
		"branches": branches,
	})
}

func (h *BranchHandler) GetBranchHandler(w http.ResponseWriter, r *http.Request) {
	idStr := r.URL.Query().Get("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		utils.BadRequest(w, errors.New("invalid branch id"))
		return
	}

	branch, err := h.DB.GetBranchByID(r.Context(), id)
	if err != nil {
		http.Error(w, "Branch not found", http.StatusNotFound)
		return
	}

	utils.WriteJSON(w, http.StatusOK, branch)
}
func (h *BranchHandler) UpdateBranchHandler(w http.ResponseWriter, r *http.Request) {
	var branch models.Branch

	if err := json.NewDecoder(r.Body).Decode(&branch); err != nil {
		utils.BadRequest(w, err)
		return
	}

	if branch.ID == 0 {
		utils.BadRequest(w, errors.New("branch id is required"))
		return
	}

	if err := h.DB.UpdateBranch(r.Context(), &branch); err != nil {
		http.Error(w, "Failed to update branch", http.StatusInternalServerError)
		return
	}

	utils.WriteJSON(w, http.StatusOK, map[string]any{
		"error":   false,
		"status":  "success",
		"message": "Branch updated successfully",
	})
}

func (h *BranchHandler) DeleteBranchHandler(w http.ResponseWriter, r *http.Request) {
	idStr := r.URL.Query().Get("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		utils.BadRequest(w, errors.New("invalid branch id"))
		return
	}

	if err := h.DB.DeleteBranch(r.Context(), id); err != nil {
		http.Error(w, "Failed to delete branch", http.StatusInternalServerError)
		return
	}

	utils.WriteJSON(w, http.StatusOK, map[string]any{
		"error":   false,
		"status":  "success",
		"message": "Branch deleted successfully",
	})
}
