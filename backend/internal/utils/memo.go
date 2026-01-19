package utils

import (
	"fmt"
	"time"

	"github.com/projuktisheba/erp-mini-api/internal/models"
)

// GenerateMemoNo generates a unique memo number string in the format "ssmmhhDDMMYYYY".
// Example for Jan 19, 2026, at 14:57:05: "05571419012026"
func GenerateMemoNo() string {
	// Layout components:
	// 05 (ss) | 04 (mm) | 15 (hh 24h) | 02 (dd) | 01 (mm) | 2006 (yyyy)
	const customLayout = "05041502012006"
	return time.Now().Format(customLayout)
}
func GetPurchaseMemo(id int64) string {
	return fmt.Sprintf("%s-%d", models.PURCHASE_MEMO_PREFIX, id)
}
func GetOrderMemo(memo string) string {
	return fmt.Sprintf("%s-%s", models.ORDER_MEMO_PREFIX, memo)
}
func GetSalaryMemo(salaryID int64) string {
	return fmt.Sprintf("%s-%d", models.SALARY_MEMO_PREFIX, salaryID)
}
func GetAdvanceSalaryMemo(salaryID int64) string {
	return fmt.Sprintf("%s-%d", models.ADVANCE_SALARY_MEMO_PREFIX, salaryID)
}
