package com.wina.partner.inv.repository;

import com.wina.partner.inv.domain.Inv;
import org.springframework.data.jpa.repository.JpaRepository;

public interface InvRepository extends JpaRepository<Inv, Long> {
}
