package com.wina.partner.inventory.repository;

import com.wina.partner.inventory.domain.Inventory;
import org.springframework.data.jpa.repository.JpaRepository;

public interface InventoryRepository extends JpaRepository<Inventory, Long> {
}
