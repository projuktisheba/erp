package utils

import (
	"net/http"
	"strings"
)

func GetURLParam(r *http.Request, parameterName string) string {
	return strings.TrimSpace(r.URL.Query().Get(parameterName))
}
