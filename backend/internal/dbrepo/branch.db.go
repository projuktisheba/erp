package dbrepo

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/projuktisheba/erp-mini-api/internal/models"
)

type BranchRepo struct {
	db *pgxpool.Pool
}

func NewBranchRepo(db *pgxpool.Pool) *BranchRepo {
	return &BranchRepo{db: db}
}

func (r *BranchRepo) CreateBranch(ctx context.Context, b *models.Branch) (int64, error) {
	var id int64

	err := r.db.QueryRow(ctx, `
		INSERT INTO branches
		(name, description, slogan, mobile, telephone, email, website,
		 country, city, address, postal_code, logo_link)
		VALUES
		($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
		RETURNING id
	`,
		b.Name, b.Description, b.Slogan, b.Mobile, b.Telephone,
		b.Email, b.Website, b.Country, b.City, b.Address,
		b.PostalCode, b.LogoLink,
	).Scan(&id)

	return id, err
}

func (r *BranchRepo) GetBranches(ctx context.Context) ([]*models.Branch, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, name, description, slogan, mobile, telephone, email,
		       website, country, city, address, postal_code, logo_link,
		       created_at, updated_at
		FROM branches
		ORDER BY id
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var branches []*models.Branch
	for rows.Next() {
		var b models.Branch
		if err := rows.Scan(
			&b.ID, &b.Name, &b.Description, &b.Slogan, &b.Mobile,
			&b.Telephone, &b.Email, &b.Website, &b.Country,
			&b.City, &b.Address, &b.PostalCode, &b.LogoLink,
			&b.CreatedAt, &b.UpdatedAt,
		); err != nil {
			return nil, err
		}
		branches = append(branches, &b)
	}

	return branches, nil
}
func (r *BranchRepo) GetBranchesByIDs(ctx context.Context, ids []int64) ([]*models.Branch, error) {
	if len(ids) == 0 {
		return []*models.Branch{}, nil
	}

	rows, err := r.db.Query(ctx, `
		SELECT id, name, description, slogan, mobile, telephone, email,
		       website, country, city, address, postal_code, logo_link,
		       created_at, updated_at
		FROM branches
		WHERE id = ANY($1)
		ORDER BY id
	`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var branches []*models.Branch
	for rows.Next() {
		var b models.Branch
		if err := rows.Scan(
			&b.ID, &b.Name, &b.Description, &b.Slogan, &b.Mobile,
			&b.Telephone, &b.Email, &b.Website, &b.Country,
			&b.City, &b.Address, &b.PostalCode, &b.LogoLink,
			&b.CreatedAt, &b.UpdatedAt,
		); err != nil {
			return nil, err
		}
		branches = append(branches, &b)
	}

	return branches, nil
}

func (r *BranchRepo) GetBranchByID(ctx context.Context, id int64) (*models.Branch, error) {
	var b models.Branch

	err := r.db.QueryRow(ctx, `
		SELECT id, name, description, slogan, mobile, telephone, email,
		       website, country, city, address, postal_code, logo_link,
		       created_at, updated_at
		FROM branches
		WHERE id = $1
	`, id).Scan(
		&b.ID, &b.Name, &b.Description, &b.Slogan, &b.Mobile,
		&b.Telephone, &b.Email, &b.Website, &b.Country,
		&b.City, &b.Address, &b.PostalCode, &b.LogoLink,
		&b.CreatedAt, &b.UpdatedAt,
	)

	return &b, err
}
func (r *BranchRepo) UpdateBranch(ctx context.Context, b *models.Branch) error {
	_, err := r.db.Exec(ctx, `
		UPDATE branches
		SET name = $1,
		    description = $2,
		    slogan = $3,
		    mobile = $4,
		    telephone = $5,
		    email = $6,
		    website = $7,
		    country = $8,
		    city = $9,
		    address = $10,
		    postal_code = $11,
		    logo_link = $12,
		    updated_at = $13
		WHERE id = $14
	`,
		b.Name, b.Description, b.Slogan, b.Mobile,
		b.Telephone, b.Email, b.Website, b.Country,
		b.City, b.Address, b.PostalCode, b.LogoLink,
		time.Now(), b.ID,
	)

	return err
}

func (r *BranchRepo) DeleteBranch(ctx context.Context, id int64) error {
	_, err := r.db.Exec(ctx, `
		DELETE FROM branches WHERE id = $1
	`, id)

	return err
}

