package com.wina.partner.contract.repository;

import com.wina.partner.contract.domain.Contract;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ContractRepository extends JpaRepository<Contract, Long> {
}
