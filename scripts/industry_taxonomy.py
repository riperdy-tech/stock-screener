"""industry_taxonomy.py — Canonical 145-Industry Taxonomy & Archetype Engine.

Maps all 145 standard FactSet/Morningstar canonical industries to:
1. GICS Sector (1 of 11)
2. Strategic Sub-Industry Cluster (1 of 24)
3. MGI Sub-Industry ID (aligned with MGI sectors.yaml proxy ETFs)
4. Corporate Finance Valuation Archetype (1 of 6)

Corporate Finance Archetypes:
  - 'commercial_bank': P/TBV, ROE, Net Interest Margin, CET1, Earnings Yield.
  - 'insurance_lending': P/E, Combined Ratio, ROE, Solvency, Statutory Surplus.
  - 'real_estate_reit': Price/FFO, Cash Flow/MCap, FFO Growth, Debt/Gross Assets.
  - 'commodity_cyclical': 3-5 yr Normalized Mid-Cycle Cash Flows, EV/IC.
  - 'rd_biotech': Cash Runway > 24 mo, Pipeline Phase Progression.
  - 'compounder_general': ROIC, Durable Gross Margin, FCF Conversion, Reverse-DCF Gap.
"""

from typing import Dict, Tuple, Optional, Any

def normalize_industry(ind: Optional[str]) -> str:
    """Normalize raw industry strings (standardizing hyphens and whitespace)."""
    if not ind:
        return "Unknown"
    return ind.replace(" - ", "-").strip()

# Canonical 145 Industries -> (Cluster, MGI_ID, Archetype, Sector)
INDUSTRY_RULES: Dict[str, Tuple[str, Optional[str], str, str]] = {
    # ── 1. Technology ────────────────────────────────────────────────────────
    "Semiconductors": ("tech_semiconductors", "semiconductors", "compounder_general", "Technology"),
    "Semiconductor Equipment & Materials": ("tech_semiconductors", "semiconductors", "compounder_general", "Technology"),
    "Software-Application": ("tech_software", "software", "compounder_general", "Technology"),
    "Software-Infrastructure": ("tech_software", "software", "compounder_general", "Technology"),
    "Computer Hardware": ("tech_hardware_systems", None, "compounder_general", "Technology"),
    "Consumer Electronics": ("tech_hardware_systems", None, "compounder_general", "Technology"),
    "Electronic Components": ("tech_hardware_systems", None, "compounder_general", "Technology"),
    "Electronics & Computer Distribution": ("tech_hardware_systems", None, "compounder_general", "Technology"),
    "Communication Equipment": ("tech_hardware_systems", None, "compounder_general", "Technology"),
    "Information Technology Services": ("tech_it_services", None, "compounder_general", "Technology"),
    "Scientific & Technical Instruments": ("tech_it_services", None, "compounder_general", "Technology"),
    "Solar": ("tech_clean_energy", None, "commodity_cyclical", "Technology"),

    # ── 2. Financial Services ────────────────────────────────────────────────
    "Banks-Regional": ("fin_banks", "banks", "commercial_bank", "Financial Services"),
    "Banks-Diversified": ("fin_banks", "banks", "commercial_bank", "Financial Services"),
    "Credit Services": ("fin_credit_lending", None, "insurance_lending", "Financial Services"),
    "Mortgage Finance": ("fin_credit_lending", None, "insurance_lending", "Financial Services"),
    "Insurance-Property & Casualty": ("fin_insurance", None, "insurance_lending", "Financial Services"),
    "Insurance-Life": ("fin_insurance", None, "insurance_lending", "Financial Services"),
    "Insurance-Specialty": ("fin_insurance", None, "insurance_lending", "Financial Services"),
    "Insurance-Diversified": ("fin_insurance", None, "insurance_lending", "Financial Services"),
    "Insurance-Reinsurance": ("fin_insurance", None, "insurance_lending", "Financial Services"),
    "Insurance Brokers": ("fin_insurance", None, "compounder_general", "Financial Services"),
    "Asset Management": ("fin_capital_markets", None, "compounder_general", "Financial Services"),
    "Capital Markets": ("fin_capital_markets", None, "compounder_general", "Financial Services"),
    "Financial Data & Stock Exchanges": ("fin_capital_markets", None, "compounder_general", "Financial Services"),
    "Financial Conglomerates": ("fin_capital_markets", None, "compounder_general", "Financial Services"),
    "Shell Companies": ("fin_special", None, "compounder_general", "Financial Services"),

    # ── 3. Industrials ───────────────────────────────────────────────────────
    "Aerospace & Defense": ("ind_aerospace_defense", None, "compounder_general", "Industrials"),
    "Specialty Industrial Machinery": ("ind_machinery_capital_goods", None, "compounder_general", "Industrials"),
    "Farm & Heavy Construction Machinery": ("ind_machinery_capital_goods", None, "commodity_cyclical", "Industrials"),
    "Electrical Equipment & Parts": ("ind_machinery_capital_goods", None, "compounder_general", "Industrials"),
    "Tools & Accessories": ("ind_machinery_capital_goods", None, "compounder_general", "Industrials"),
    "Metal Fabrication": ("ind_machinery_capital_goods", None, "commodity_cyclical", "Industrials"),
    "Building Products & Equipment": ("ind_construction_materials", None, "compounder_general", "Industrials"),
    "Engineering & Construction": ("ind_construction_materials", None, "compounder_general", "Industrials"),
    "Infrastructure Operations": ("ind_construction_materials", None, "compounder_general", "Industrials"),
    "Marine Shipping": ("ind_freight_logistics", None, "commodity_cyclical", "Industrials"),
    "Integrated Freight & Logistics": ("ind_freight_logistics", None, "compounder_general", "Industrials"),
    "Trucking": ("ind_freight_logistics", None, "commodity_cyclical", "Industrials"),
    "Railroads": ("ind_freight_logistics", None, "compounder_general", "Industrials"),
    "Airlines": ("ind_freight_logistics", None, "commodity_cyclical", "Industrials"),
    "Airports & Air Services": ("ind_freight_logistics", None, "compounder_general", "Industrials"),
    "Specialty Business Services": ("ind_commercial_services", None, "compounder_general", "Industrials"),
    "Consulting Services": ("ind_commercial_services", None, "compounder_general", "Industrials"),
    "Rental & Leasing Services": ("ind_commercial_services", None, "compounder_general", "Industrials"),
    "Security & Protection Services": ("ind_commercial_services", None, "compounder_general", "Industrials"),
    "Staffing & Employment Services": ("ind_commercial_services", None, "compounder_general", "Industrials"),
    "Waste Management": ("ind_commercial_services", None, "compounder_general", "Industrials"),
    "Pollution & Treatment Controls": ("ind_commercial_services", None, "compounder_general", "Industrials"),
    "Industrial Distribution": ("ind_commercial_services", None, "compounder_general", "Industrials"),
    "Business Equipment & Supplies": ("ind_commercial_services", None, "compounder_general", "Industrials"),
    "Conglomerates": ("ind_commercial_services", None, "compounder_general", "Industrials"),

    # ── 4. Healthcare ────────────────────────────────────────────────────────
    "Biotechnology": ("health_biotech", "biotech", "rd_biotech", "Healthcare"),
    "Diagnostics & Research": ("health_biotech", "biotech", "compounder_general", "Healthcare"),
    "Drug Manufacturers-General": ("health_pharma", None, "compounder_general", "Healthcare"),
    "Drug Manufacturers-Specialty & Generic": ("health_pharma", None, "compounder_general", "Healthcare"),
    "Medical Devices": ("health_devices_supplies", None, "compounder_general", "Healthcare"),
    "Medical Instruments & Supplies": ("health_devices_supplies", None, "compounder_general", "Healthcare"),
    "Health Information Services": ("health_services_facilities", None, "compounder_general", "Healthcare"),
    "Healthcare Plans": ("health_services_facilities", None, "compounder_general", "Healthcare"),
    "Medical Care Facilities": ("health_services_facilities", None, "compounder_general", "Healthcare"),
    "Medical Distribution": ("health_services_facilities", None, "compounder_general", "Healthcare"),
    "Pharmaceutical Retailers": ("health_services_facilities", None, "compounder_general", "Healthcare"),

    # ── 5. Energy ────────────────────────────────────────────────────────────
    "Oil & Gas E&P": ("energy_upstream", "oil_gas_ep", "commodity_cyclical", "Energy"),
    "Oil & Gas Integrated": ("energy_upstream", "oil_gas_ep", "commodity_cyclical", "Energy"),
    "Oil & Gas Drilling": ("energy_services", None, "commodity_cyclical", "Energy"),
    "Oil & Gas Equipment & Services": ("energy_services", None, "commodity_cyclical", "Energy"),
    "Oil & Gas Midstream": ("energy_midstream_refining", None, "compounder_general", "Energy"),
    "Oil & Gas Refining & Marketing": ("energy_midstream_refining", None, "commodity_cyclical", "Energy"),
    "Thermal Coal": ("energy_services", None, "commodity_cyclical", "Energy"),
    "Uranium": ("energy_services", None, "commodity_cyclical", "Energy"),

    # ── 6. Basic Materials ───────────────────────────────────────────────────
    "Chemicals": ("mat_chemicals", None, "commodity_cyclical", "Basic Materials"),
    "Specialty Chemicals": ("mat_chemicals", None, "compounder_general", "Basic Materials"),
    "Agricultural Inputs": ("mat_chemicals", None, "commodity_cyclical", "Basic Materials"),
    "Building Materials": ("mat_construction", None, "compounder_general", "Basic Materials"),
    "Steel": ("mat_metals_mining", None, "commodity_cyclical", "Basic Materials"),
    "Aluminum": ("mat_metals_mining", None, "commodity_cyclical", "Basic Materials"),
    "Copper": ("mat_metals_mining", None, "commodity_cyclical", "Basic Materials"),
    "Gold": ("mat_metals_mining", None, "commodity_cyclical", "Basic Materials"),
    "Silver": ("mat_metals_mining", None, "commodity_cyclical", "Basic Materials"),
    "Other Precious Metals & Mining": ("mat_metals_mining", None, "commodity_cyclical", "Basic Materials"),
    "Other Industrial Metals & Mining": ("mat_metals_mining", None, "commodity_cyclical", "Basic Materials"),
    "Coking Coal": ("mat_metals_mining", None, "commodity_cyclical", "Basic Materials"),
    "Lumber & Wood Production": ("mat_paper_lumber", None, "commodity_cyclical", "Basic Materials"),
    "Paper & Paper Products": ("mat_paper_lumber", None, "commodity_cyclical", "Basic Materials"),

    # ── 7. Consumer Cyclical ─────────────────────────────────────────────────
    "Residential Construction": ("cons_homebuilders", "homebuilders", "commodity_cyclical", "Consumer Cyclical"),
    "Auto Manufacturers": ("cons_automotive", None, "commodity_cyclical", "Consumer Cyclical"),
    "Auto Parts": ("cons_automotive", None, "compounder_general", "Consumer Cyclical"),
    "Auto & Truck Dealerships": ("cons_automotive", None, "compounder_general", "Consumer Cyclical"),
    "Recreational Vehicles": ("cons_automotive", None, "commodity_cyclical", "Consumer Cyclical"),
    "Apparel Retail": ("cons_retail", None, "compounder_general", "Consumer Cyclical"),
    "Specialty Retail": ("cons_retail", None, "compounder_general", "Consumer Cyclical"),
    "Home Improvement Retail": ("cons_retail", None, "compounder_general", "Consumer Cyclical"),
    "Internet Retail": ("cons_retail", None, "compounder_general", "Consumer Cyclical"),
    "Department Stores": ("cons_retail", None, "commodity_cyclical", "Consumer Cyclical"),
    "Restaurants": ("cons_leisure_dining", None, "compounder_general", "Consumer Cyclical"),
    "Lodging": ("cons_leisure_dining", None, "compounder_general", "Consumer Cyclical"),
    "Resorts & Casinos": ("cons_leisure_dining", None, "compounder_general", "Consumer Cyclical"),
    "Gambling": ("cons_leisure_dining", None, "compounder_general", "Consumer Cyclical"),
    "Leisure": ("cons_leisure_dining", None, "compounder_general", "Consumer Cyclical"),
    "Travel Services": ("cons_leisure_dining", None, "compounder_general", "Consumer Cyclical"),
    "Apparel Manufacturing": ("cons_goods_apparel", None, "compounder_general", "Consumer Cyclical"),
    "Footwear & Accessories": ("cons_goods_apparel", None, "compounder_general", "Consumer Cyclical"),
    "Furnishings, Fixtures & Appliances": ("cons_goods_apparel", None, "commodity_cyclical", "Consumer Cyclical"),
    "Luxury Goods": ("cons_goods_apparel", None, "compounder_general", "Consumer Cyclical"),
    "Packaging & Containers": ("cons_goods_apparel", None, "compounder_general", "Consumer Cyclical"),
    "Personal Services": ("cons_goods_apparel", None, "compounder_general", "Consumer Cyclical"),
    "Textile Manufacturing": ("cons_goods_apparel", None, "commodity_cyclical", "Consumer Cyclical"),

    # ── 8. Consumer Defensive ────────────────────────────────────────────────
    "Discount Stores": ("def_retail_distribution", None, "compounder_general", "Consumer Defensive"),
    "Grocery Stores": ("def_retail_distribution", None, "compounder_general", "Consumer Defensive"),
    "Food Distribution": ("def_retail_distribution", None, "compounder_general", "Consumer Defensive"),
    "Packaged Foods": ("def_staples_goods", None, "compounder_general", "Consumer Defensive"),
    "Confectioners": ("def_staples_goods", None, "compounder_general", "Consumer Defensive"),
    "Farm Products": ("def_staples_goods", None, "commodity_cyclical", "Consumer Defensive"),
    "Household & Personal Products": ("def_staples_goods", None, "compounder_general", "Consumer Defensive"),
    "Beverages-Brewers": ("def_beverages_tobacco", None, "compounder_general", "Consumer Defensive"),
    "Beverages-Non-Alcoholic": ("def_beverages_tobacco", None, "compounder_general", "Consumer Defensive"),
    "Beverages-Wineries & Distilleries": ("def_beverages_tobacco", None, "compounder_general", "Consumer Defensive"),
    "Tobacco": ("def_beverages_tobacco", None, "compounder_general", "Consumer Defensive"),
    "Education & Training Services": ("def_retail_distribution", None, "compounder_general", "Consumer Defensive"),

    # ── 9. Communication Services ────────────────────────────────────────────
    "Internet Content & Information": ("comm_digital_media", None, "compounder_general", "Communication Services"),
    "Electronic Gaming & Multimedia": ("comm_digital_media", None, "compounder_general", "Communication Services"),
    "Entertainment": ("comm_media_entertainment", None, "compounder_general", "Communication Services"),
    "Broadcasting": ("comm_media_entertainment", None, "compounder_general", "Communication Services"),
    "Advertising Agencies": ("comm_media_entertainment", None, "compounder_general", "Communication Services"),
    "Publishing": ("comm_media_entertainment", None, "compounder_general", "Communication Services"),
    "Telecom Services": ("comm_telecom", None, "compounder_general", "Communication Services"),

    # ── 10. Real Estate ──────────────────────────────────────────────────────
    "REIT-Industrial": ("re_industrial_logistics", None, "real_estate_reit", "Real Estate"),
    "REIT-Residential": ("re_residential", None, "real_estate_reit", "Real Estate"),
    "REIT-Retail": ("re_commercial", None, "real_estate_reit", "Real Estate"),
    "REIT-Office": ("re_commercial", None, "real_estate_reit", "Real Estate"),
    "REIT-Healthcare Facilities": ("re_specialized", None, "real_estate_reit", "Real Estate"),
    "REIT-Hotel & Motel": ("re_specialized", None, "real_estate_reit", "Real Estate"),
    "REIT-Specialty": ("re_specialized", None, "real_estate_reit", "Real Estate"),
    "REIT-Diversified": ("re_specialized", None, "real_estate_reit", "Real Estate"),
    "REIT-Mortgage": ("re_mortgage_reit", None, "insurance_lending", "Real Estate"),
    "Real Estate Services": ("re_services", None, "compounder_general", "Real Estate"),
    "Real Estate-Development": ("re_services", None, "commodity_cyclical", "Real Estate"),
    "Real Estate-Diversified": ("re_services", None, "compounder_general", "Real Estate"),

    # ── 11. Utilities ────────────────────────────────────────────────────────
    "Utilities-Regulated Electric": ("util_regulated", None, "compounder_general", "Utilities"),
    "Utilities-Regulated Gas": ("util_regulated", None, "compounder_general", "Utilities"),
    "Utilities-Regulated Water": ("util_regulated", None, "compounder_general", "Utilities"),
    "Utilities-Diversified": ("util_regulated", None, "compounder_general", "Utilities"),
    "Utilities-Independent Power Producers": ("util_power_generation", None, "commodity_cyclical", "Utilities"),
    "Utilities-Renewable": ("util_power_generation", None, "commodity_cyclical", "Utilities"),
}


def get_taxonomy_profile(raw_industry: Optional[str], default_sector: Optional[str] = None) -> Dict[str, Any]:
    """Look up taxonomy profile for any raw industry string.
    
    Returns:
      {
        'canonical_industry': str,
        'sector': str,
        'cluster': str,
        'mgi_subindustry_id': Optional[str],
        'archetype': str
      }
    """
    norm = normalize_industry(raw_industry)
    rule = INDUSTRY_RULES.get(norm)
    if rule:
        cluster, mgi_id, arch, sec = rule
        return {
            "canonical_industry": norm,
            "sector": sec,
            "cluster": cluster,
            "mgi_subindustry_id": mgi_id,
            "archetype": arch
        }
    return {
        "canonical_industry": norm if norm != "Unknown" else "Unknown",
        "sector": default_sector or "Unknown",
        "cluster": "general_unclassified",
        "mgi_subindustry_id": None,
        "archetype": "compounder_general"
    }
