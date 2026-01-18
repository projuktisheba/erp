package utils

import (
	"fmt"

	"github.com/projuktisheba/erp-mini-api/internal/models"
)

func GetSalaryMemo(salaryID int64) string {
	return fmt.Sprintf("%s-%d",models.SALARY_MEMO_PREFIX, salaryID)
}
func GetAdvanceSalaryMemo(salaryID int64) string {
	return fmt.Sprintf("%s-%d",models.ADVANCE_SALARY_MEMO_PREFIX, salaryID)
}