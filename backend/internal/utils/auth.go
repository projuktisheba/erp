package utils

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/projuktisheba/erp-mini-api/internal/models"
	"golang.org/x/crypto/bcrypt"
)

// HashPassword generates a bcrypt hash of the password
func HashPassword(password string) (string, error) {
	hashedBytes, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hashedBytes), nil
}

// CheckPassword compares a plain password with its hashed version
func CheckPassword(password, hashed string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hashed), []byte(password))
	return err == nil
}

// GenerateJWT generates a JWT token for the given user
func GenerateJWT(user models.JWT, cfg models.JWTConfig) (string, error) {
	now := time.Now()
	claims := jwt.MapClaims{
		"id":         user.ID,
		"name":       user.Name,
		"username":   user.Username,
		"role":       user.Role,
		"iss":        cfg.Issuer,
		"aud":        cfg.Audience,
		"exp":        now.Add(cfg.Expiry).Unix(),
		"iat":        now.Unix(),
		"created_at": user.CreatedAt,
		"updated_at": user.UpdatedAt,
	}

	token := jwt.NewWithClaims(jwt.GetSigningMethod(cfg.Algorithm), claims)
	return token.SignedString([]byte(cfg.SecretKey))
}

// ParseJWT validates the token and returns claims
func ParseJWT(tokenString string, cfg models.JWTConfig) (*models.JWT, error) {
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		if token.Method.Alg() != cfg.Algorithm {
			return nil, errors.New("unexpected signing method")
		}
		return []byte(cfg.SecretKey), nil
	})
	if err != nil || !token.Valid {
		return nil, errors.New("invalid token")
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return nil, errors.New("invalid claims")
	}

	return &models.JWT{
		ID:        int64(claims["id"].(float64)),
		Name:      claims["name"].(string),
		Username:  claims["username"].(string),
		Role:      claims["role"].(string),
		Issuer:    claims["iss"].(string),
		Audience:  claims["aud"].(string),
		ExpiresAt: int64(claims["exp"].(float64)),
		IssuedAt:  int64(claims["iat"].(float64)),
	}, nil
}
