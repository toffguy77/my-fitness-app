package openfoodfacts

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

const (
	BaseURL   = "https://world.openfoodfacts.org/api/v2/product"
	UserAgent = "BurcevFitnessApp/1.0 (https://burcev.team)"
	Timeout   = 10 * time.Second
)

type Product struct {
	Code     string
	Name     string
	Brand    string
	Calories float64
	Protein  float64
	Fat      float64
	Carbs    float64
}

type apiResponse struct {
	Status  int `json:"status"`
	Product struct {
		ProductName string `json:"product_name"`
		Brands      string `json:"brands"`
		Nutriments  struct {
			EnergyKcal100g float64 `json:"energy-kcal_100g"`
			Proteins100g   float64 `json:"proteins_100g"`
			Fat100g        float64 `json:"fat_100g"`
			Carbs100g      float64 `json:"carbohydrates_100g"`
		} `json:"nutriments"`
	} `json:"product"`
}

type Client struct {
	httpClient *http.Client
}

func NewClient() *Client {
	return &Client{
		httpClient: &http.Client{Timeout: Timeout},
	}
}

// LookupBarcode queries OpenFoodFacts API for a product by barcode.
// Returns nil, nil if product is not found.
func (c *Client) LookupBarcode(ctx context.Context, barcode string) (*Product, error) {
	url := fmt.Sprintf("%s/%s?fields=product_name,brands,nutriments", BaseURL, barcode)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("User-Agent", UserAgent)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status: %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	var apiResp apiResponse
	if err := json.Unmarshal(body, &apiResp); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	if apiResp.Status != 1 || apiResp.Product.ProductName == "" {
		return nil, nil // not found
	}

	return &Product{
		Code:     barcode,
		Name:     apiResp.Product.ProductName,
		Brand:    apiResp.Product.Brands,
		Calories: apiResp.Product.Nutriments.EnergyKcal100g,
		Protein:  apiResp.Product.Nutriments.Proteins100g,
		Fat:      apiResp.Product.Nutriments.Fat100g,
		Carbs:    apiResp.Product.Nutriments.Carbs100g,
	}, nil
}
