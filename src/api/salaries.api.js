// Salary records (web: pages/salaries/SalariesPage.jsx — fetchAllRecords("hrc_salaries")). Read-only on web.
import { gateway } from "../services/api";
import { fetchAllPages } from "../utils/records";

export const salaryListKey = ["salaries", "list"];

export const fetchSalaries = async () => (await fetchAllPages(gateway, { action: "fetch", module: "hrc_salaries" })).records;
