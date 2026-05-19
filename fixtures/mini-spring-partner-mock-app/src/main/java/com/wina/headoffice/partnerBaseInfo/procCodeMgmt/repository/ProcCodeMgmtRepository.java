package com.wina.headoffice.partnerBaseInfo.procCodeMgmt.repository;

import org.apache.ibatis.annotations.Mapper;
import java.util.List;
import java.util.Map;

@Mapper
public interface ProcCodeMgmtRepository {
    List<Map<String, Object>> retrieveProcCodeList();
    int insertProcCode();
}
