package utils

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// readJSON read json from request body into data. It accepts a sinle JSON of 1MB max size value in the body
func ReadJSON(w http.ResponseWriter, r *http.Request, data any) error {
	maxBytes := 1048576 //maximum allowable bytes is 1MB

	r.Body = http.MaxBytesReader(w, r.Body, int64(maxBytes))

	dec := json.NewDecoder(r.Body)
	err := dec.Decode(data)
	if err != nil {
		return err
	}

	err = dec.Decode(&struct{}{})

	if err != io.EOF {
		return errors.New("body must only have a single JSON value")
	}

	return nil
}

// writeJSON writes arbitrary data out as json
func WriteJSON(w http.ResponseWriter, status int, data any, headers ...http.Header) error {
	out, err := json.MarshalIndent(data, "", "    ")
	if err != nil {
		return err
	}
	//add the headers if exists
	if len(headers) > 0 {
		for i, v := range headers[0] {
			w.Header()[i] = v
		}
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	w.Write(out)
	return nil
}

// badRequest sends a JSON response with the status http.StatusBadRequest, describing the error
func BadRequest(w http.ResponseWriter, err error) {
	var payload struct {
		Error   bool   `json:"error"`
		Message string `json:"message"`
	}

	payload.Error = true
	payload.Message = err.Error()
	_ = WriteJSON(w, http.StatusBadRequest, payload)
}

// NotFound sends a 404 JSON response with a standard structure.
func NotFound(w http.ResponseWriter, message string) {
	if message == "" {
		message = "Resource not found"
	}

	resp := struct {
		Error   bool   `json:"error"`
		Status  string `json:"status"`
		Message string `json:"message"`
	}{
		Error:   true,
		Status:  "not_found",
		Message: message,
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusNotFound)
	_ = json.NewEncoder(w).Encode(resp)
}

// ServerError sends a 500 JSON response with a standard structure.
func ServerError(w http.ResponseWriter, err error) {
	message := "Internal server error"
	if err != nil && err.Error() != "" {
		message = err.Error()
	}

	resp := struct {
		Error   bool   `json:"error"`
		Status  string `json:"status"`
		Message string `json:"message"`
	}{
		Error:   true,
		Status:  "server_error",
		Message: message,
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusInternalServerError)
	_ = json.NewEncoder(w).Encode(resp)
}

// Today returns the current date with time set to 00:00:00
func Today() time.Time {
	now := time.Now()
	return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
}

// NullableTime converts zero time to nil
func NullableTime(t time.Time) any {
	if t.IsZero() {
		return nil
	}
	return t
}

func GetBranchID(r *http.Request) int64 {
	branchID, _ := strconv.ParseInt(r.Header.Get("X-Branch-ID"), 10, 64)
	return branchID
}

// GenerateMemoNo generates a memo number like "MMDD-4CHAR"
func GenerateMemoNo() string {
	// create a new rand with its own seed
	r := rand.New(rand.NewSource(time.Now().UnixNano()))

	// MMDD part
	datePart := time.Now().Format("0102")
	const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	// 4 random alphanumeric characters
	randomPart := make([]byte, 4)
	for i := range randomPart {
		randomPart[i] = charset[r.Intn(len(charset))]
	}

	return fmt.Sprintf("%s%s", datePart, string(randomPart))
}

// IsUniqueViolation checks if an error contains a unique constraint violation
// for the specified database constraint name.
func IsUniqueViolation(err error, constraintName string) bool {
	if err == nil {
		return false
	}
	// Convert error message to lowercase for case-insensitive search
	errMsg := strings.ToLower(err.Error())
	constraintName = strings.ToLower(constraintName)

	// Check if the error message mentions the unique constraint
	if strings.Contains(errMsg, "unique") && strings.Contains(errMsg, constraintName) {
		return true
	}
	return false
}
