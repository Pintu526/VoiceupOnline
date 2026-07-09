import { useContext } from "react";
import { GrowthContext } from "../providers/GrowthProvider";

export function useGrowth() {
  const context = useContext(GrowthContext);
  if (!context) {
    throw new Error("useGrowth must be used inside GrowthProvider.");
  }
  return context;
}

export function useGrowthEvents() {
  return useGrowth().events;
}

export function useGrowthDashboardModel() {
  return useGrowth().dashboardModel;
}
